/**
 * VPS API Server — Replaces all Supabase Edge Functions
 * Version: 1.2.4 - Emergency 502/Startup Fix
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
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
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';

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
app.get('/api/health', async (req, res) => {
  let dbStatus = 'ok';
  let dbError = null;
  
  try {
    const result = await pool.query('SELECT 1 as health');
    if (!result.rows.length) dbStatus = 'error';
  } catch (err) {
    dbStatus = 'error';
    dbError = err.message;
  }

  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    uptime: process.uptime(),
    database: {
      status: dbStatus,
      error: dbError
    },
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

const pool = pgConnectionString
  ? new Pool({ connectionString: pgConnectionString })
  : new Pool({
      host: process.env.PG_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.PG_PORT || process.env.PGPORT) || 5432,
      database: process.env.PG_DATABASE || process.env.PGDATABASE || process.env.DB_NAME || 'pulse_db',
      user: process.env.PG_USER || process.env.PGUSER || process.env.DB_USER || 'pulse_user',
      ...(typeof pgPassword === 'string' && pgPassword.length > 0 ? { password: pgPassword } : {}),
    });

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

        // Atualizar Constraint de Status para incluir 'fridge'
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
          CHECK (status IN ('lead', 'contacted', 'meeting', 'contracted', 'lost', 'recovery_followup_1', 'recovery_followup_2', 'fridge'))
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
  'has_vehicle_flyer',
  'niche',
  'whatsapp',
  'city',
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

    const [client, professionals, units] = await Promise.all([
      pool.query('SELECT id, company_name, logo_url FROM clients WHERE id = $1 LIMIT 1', [clientId]),
      pool.query(
        `SELECT id, name, specialty, council_type, council_number, rqe, bio, schedule_notes, photos, videos, active
         FROM client_professionals WHERE client_id = $1 ORDER BY name ASC`,
        [clientId],
      ),
      pool.query(
        `SELECT id, unit_name, unit_type, city_name, state, address, notes, photos, videos
         FROM client_units WHERE client_id = $1 ORDER BY city_name ASC`,
        [clientId],
      ),
    ]);

    if (client.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

    return res.json({
      client: client.rows[0],
      professionals: professionals.rows,
      units: units.rows,
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

async function cleanupOldPortalVideos(options = {}) {
  const { 
    months = [], 
    clientId = null, 
    allClients = true, 
    olderThanDays = 60,
    contentTypes = []
  } = options;

  let query = `DELETE FROM client_portal_contents
    WHERE file_url IS NOT NULL
      AND content_type <> 'arte'`;
  const params = [];

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
  
  query += ' RETURNING file_url, thumbnail_url';
  const { rows, rowCount } = await pool.query(query, params);

  let freedBytes = 0;
  for (const row of rows) {
    for (const url of [row.file_url, row.thumbnail_url]) {
      if (!url) continue;
      // Não apaga se outro registro ainda usa o mesmo arquivo.
      const { rows: [{ still_used }] } = await pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM client_portal_contents
           WHERE file_url = $1 OR thumbnail_url = $1
         ) AS still_used`,
        [url],
      );
      if (still_used) continue;
      freedBytes += removeUploadFile(url);
    }
  }

  lastCleanupStats = { deletedCount: rowCount, freedBytes, at: new Date().toISOString() };
  console.log(`[cleanup] ${rowCount} registros removidos, ${(freedBytes / 1048576).toFixed(1)} MB liberados`);
  return rowCount;
}

let lastCleanupStats = { deletedCount: 0, freedBytes: 0, at: null };


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

// ─── JWT Config ─────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
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

    const profile = await getAuthProfileById(decoded.sub).catch(err => {
      console.error("[Auth-DB-Error] Failed to fetch profile from DB:", { sub: decoded.sub, error: err.message });
      return null;
    });

    if (!profile) {
      console.warn("[Auth-ProfileNotFound] User ID not found in profiles table, using token claims:", { sub: decoded.sub });
    }

    const role = profile
      ? await getUserPrimaryRole(profile.id, profile.role || decoded.role || 'editor')
      : (decoded.role || 'editor');

    return {
      user: {
        id: profile?.id || decoded.sub,
        email: profile?.email || decoded.email,
        role,
      },
      userClient: getUserClient(authHeader),
    };
  } catch (error) {
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

async function getLinkedUserIds(user) {
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

async function verifyAdmin(req) {
  const { user, userClient } = await verifyUser(req);
  if (await isAdminUser(user)) {
    return { user, userClient, admin: getAdminClient() };
  }
  throw new Error('Admin access required');
}


let profilesPasswordHashColumnPromise;
let authSupportTablesPromise;
const wssClients = new Set();
const tableColumnsPromiseCache = new Map();

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
         COALESCE(${profileRole}, ${userRole}, 'admin') AS role,
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
           'admin'::text AS role,
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
         COALESCE(${profileRole}, ${userRole}, 'admin') AS role,
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
           'admin'::text AS role,
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
                'admin'::text AS role,
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
        LIMIT 1`,
      [userId]
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

      if (!passwordHash.startsWith('$2') && passwordHash === rawPassword) return true;
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

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Login ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const normalizedEmail = String(email).toLowerCase().trim();
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

    if (!profile || !valid) return res.status(401).json({ error: 'Email ou senha inválidos' });

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
    const profile = await getAuthProfileById(decoded.sub);

    if (!profile) return res.status(401).json({ error: 'Perfil não encontrado' });

    const role = await getUserPrimaryRole(profile.id, profile.role || decoded.role || 'editor');
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
    res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }
});

// ─── Get current user ───────────────────────────────────────
app.get('/api/auth/me', async (req, res) => {
  try {
    await ensureAuthSupportTables();
    const { user } = await verifyUser(req);
    const profileColumns = await getExistingColumns('profiles').catch(() => new Set());
    const roleColumns = await getExistingColumns('user_roles').catch(() => new Set());
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
                COALESCE(${roleColumns.has('role') ? 'ur.role::text' : 'NULL::text'}, ${profileColumns.has('role') ? 'p.role::text' : 'NULL::text'}, $2) AS role
           FROM profiles p
           ${roleColumns.has('user_id') && roleColumns.has('role') ? 'LEFT JOIN user_roles ur ON ur.user_id = p.id' : ''}
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
      avatar_url: profile.avatar_url,
      job_title: profile.job_title,
      bio: profile.bio,
      birthday: profile.birthday,
      monthly_salary: profile.monthly_salary || 0,
    });
  } catch (error) {
    res.status(401).json({ error: 'Não autenticado' });
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

    const profile = await getAuthProfileById(user.id);
    if (!profile) return res.status(404).json({ error: 'Perfil não encontrado' });

    if (profile.password_hash && currentPassword) {
      const valid = await verifyStoredPassword(currentPassword, profile.password_hash, profile.auth_password_hash, profile.profile_password_hash);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    await storeUserPassword(user.id, newPassword);

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Set password for a team member ──────────────────
app.post('/api/auth/set-password', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { userId, password } = req.body;
    if (!userId || !password || password.length < 6) return res.status(400).json({ error: 'userId e senha (min 6 chars) obrigatórios' });

    await storeUserPassword(userId, password);

    res.json({ success: true, message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: error.message });
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

    if (!isSelfRegister) {
      await verifyAdmin(req);
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

    const saved = await saveUserCities(id, cities && cities.length ? cities : ['minacu'], primaryCity);

    res.json({ success: true, user: { id, name, email: normalizedEmail, role: userRole, cities: saved.cities, primary_city: saved.primary } });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Reset password ──────────────────────────────────
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'userId e nova senha (min 6 chars) obrigatórios' });

    await storeUserPassword(userId, newPassword);

    res.json({ success: true, message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Listar cidades de todos os usuários ─────────────
app.get('/api/admin/user-cities', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    await verifyAdmin(req);
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

// ─── Admin: Atualizar cidades de um usuário ─────────────────
app.post('/api/admin/user-cities', async (req, res) => {
  try {
    await ensureUserCitiesTable();
    await verifyAdmin(req);
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

async function callAi(ai, model, messages, options = {}) {
  const { temperature = 0.3, max_tokens = 2000, retries = 2 } = options;
  
  // Fallback chain: se o modelo falhar com 429, tenta modelos com cotas mais altas
  const FALLBACK_MODELS = {
    'gemini-2.5-flash': ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    'gemini-2.5-pro': ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    'gemini-1.5-flash-8b': ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'],
    'gemini-1.5-flash': ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    'gemini-1.5-pro': ['gemini-2.5-pro', 'gemini-2.5-flash'],
  };
  const modelsToTry = ai.provider === 'gemini' 
    ? [model, ...(FALLBACK_MODELS[model] || [])]
    : [model];

  let lastError;
  for (const tryModel of modelsToTry) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (ai.provider === 'claude') {
          const systemMsg = messages.find(m => m.role === 'system');
          const otherMsgs = messages.filter(m => m.role !== 'system');
          const res = await fetch(ai.url, {
            method: 'POST',
            headers: { 'x-api-key': ai.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: tryModel, max_tokens, ...(systemMsg ? { system: systemMsg.content } : {}), messages: otherMsgs }),
          });
          if (!res.ok) throw new Error(`Claude error [${res.status}]: ${await res.text()}`);
          const data = await res.json();
          return data.content?.[0]?.text || '';
        }
        const res = await fetch(ai.url, {
          method: 'POST',
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
        if (err.status === 429 || err.status === 404) break; // próximo modelo
        if (attempt === retries) throw err;
      }
    }
  }
  throw lastError || new Error('AI: todos modelos falharam');
}


// WhatsApp helper
const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send';
const PORTAL_BASE_URL = 'https://pulsegrowthmarketing.lovable.app/portal';

async function sendWhatsAppDirect(config, number, message, db, clientId, triggerType) {
  try {
    const apiBody = {
      number: number.replace(/\D/g, ''),
      body: message,
      userId: config.default_user_id || '',
      queueId: config.default_queue_id || '',
      sendSignature: config.send_signature || false,
      closeTicket: config.close_ticket || false,
    };
    const apiResponse = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.api_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(apiBody),
    });
    const apiResult = await apiResponse.json();
    await db.from('whatsapp_messages').insert({
      phone_number: number.replace(/\D/g, ''),
      message,
      status: apiResponse.ok ? 'sent' : 'failed',
      api_response: apiResult,
      client_id: clientId || null,
      trigger_type: triggerType,
    });
    return { ok: apiResponse.ok, result: apiResult };
  } catch (e) {
    console.error('sendWhatsApp error:', e);
    return { ok: false, error: e.message };
  }
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

    const selectedModel = aiModel || 'gemini-2.5-flash';
    const now = new Date();
    const SYSTEM_START = '2026-03-01'; // Sistema iniciou em março 2026
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const fmt = v => Number(v || 0).toLocaleString('pt-BR');
    const fmtMoney = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => { if (!d) return 'N/A'; const dt = typeof d === 'string' ? d : d.toISOString(); return dt.slice(0, 10).split('-').reverse().join('/'); };

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
      pool.query(`SELECT config FROM api_integrations WHERE provider = ANY($1) AND status = 'ativo' LIMIT 1`, [['ai_gemini', 'ai_openai', 'ai_claude']]),
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
        `INSERT INTO financial_chat_messages (id, user_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW()), ($4, $2, 'assistant', $5, NOW())`,
        [crypto.randomUUID(), user.id, question, crypto.randomUUID(), answer]
      );

      return res.json({ answer });
    }

    const messages = [{ role: 'system', content: systemPrompt }];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: question });

    // Get API key from local DB
    const dbApiKeyConfig = apiKeyRes.rows?.[0]?.config;
    const dbApiKey = dbApiKeyConfig?.api_key_encrypted;
    const ai = getAiConfig(aiProvider, dbApiKey);
    const answer = await callAi(ai, selectedModel, messages, { temperature: 0.3, max_tokens: 3000 });

    // Save chat messages to local DB
    await pool.query(
      `INSERT INTO financial_chat_messages (id, user_id, role, content, created_at) VALUES ($1, $2, 'user', $3, NOW()), ($4, $2, 'assistant', $5, NOW())`,
      [crypto.randomUUID(), user.id, question, crypto.randomUUID(), answer]
    );

    res.json({ answer });
  } catch (error) {
    console.error('Financial chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 2. Send WhatsApp ───────────────────────────────────────
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const { user, userClient } = await verifyUser(req);
    const admin = getAdminClient();

    const { data: configData } = await admin.from('whatsapp_config').select('api_token, default_user_id, default_queue_id, send_signature, close_ticket').limit(1).single();
    const WHATSAPP_TOKEN = configData?.api_token;
    if (!WHATSAPP_TOKEN) return res.status(400).json({ error: 'Token da API WhatsApp não configurado' });

    const { action, number, message, userId: apiUserId, queueId, sendSignature, closeTicket, clientId, triggerType, mediaUrl, mediaFileName } = req.body;
    const effectiveUserId = apiUserId || configData?.default_user_id || '';
    const effectiveQueueId = queueId || configData?.default_queue_id || '';
    const effectiveSignature = sendSignature !== undefined ? sendSignature : (configData?.send_signature || false);
    const effectiveCloseTicket = closeTicket !== undefined ? closeTicket : (configData?.close_ticket || false);

    if (action === 'test_connection') {
      try {
        const testResponse = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: '0', body: '', userId: '', queueId: '', sendSignature: false, closeTicket: false }),
        });
        const isTokenValid = testResponse.status !== 401 && testResponse.status !== 403;
        return res.json({ success: isTokenValid, status: testResponse.status });
      } catch (e) {
        return res.status(502).json({ success: false, error: 'Não foi possível conectar à API' });
      }
    }

    if (!number || !message) return res.status(400).json({ error: 'number and message are required' });
    const cleanNumber = number.replace(/\D/g, '');

    let apiResponse, apiResult;
    if (mediaUrl) {
      const fileResponse = await fetch(mediaUrl);
      if (!fileResponse.ok) return res.status(400).json({ error: 'Não foi possível baixar o arquivo de mídia' });
      const fileBlob = await fileResponse.blob();
      const fileName = mediaFileName || mediaUrl.split('/').pop() || 'file';
      const formData = new FormData();
      formData.append('number', cleanNumber);
      formData.append('body', message);
      formData.append('userId', effectiveUserId);
      formData.append('queueId', effectiveQueueId);
      formData.append('sendSignature', String(effectiveSignature));
      formData.append('closeTicket', String(effectiveCloseTicket));
      formData.append('medias', fileBlob, fileName);
      apiResponse = await fetch(WHATSAPP_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, body: formData });
      apiResult = await apiResponse.json();
    } else {
      apiResponse = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanNumber, body: message, userId: effectiveUserId, queueId: effectiveQueueId, sendSignature: effectiveSignature, closeTicket: effectiveCloseTicket }),
      });
      apiResult = await apiResponse.json();
    }

    const status = apiResponse.ok ? 'sent' : 'failed';
    await userClient.from('whatsapp_messages').insert({
      phone_number: cleanNumber,
      message: mediaUrl ? `${message} [📎 ${mediaFileName || 'arquivo'}]` : message,
      status,
      api_response: apiResult,
      sent_by: user.id,
      client_id: clientId || null,
      trigger_type: triggerType || 'manual',
    });

    res.status(apiResponse.ok ? 200 : 502).json({ success: apiResponse.ok, status, apiResult });
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

app.post('/api/generate-script', async (req, res) => {
  try {
    const { editorial, videoType, contentFormat, clientName, niche, exampleScripts, aiModel, aiProvider } = req.body;
    const admin = getAdminClient();
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = getAiConfig(aiProvider, dbApiKey);
    const selectedModel = aiModel || 'gemini-2.5-flash';
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
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${ai.key}`;
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
    res.status(500).json({ error: error.message });
  }
});

// ─── 4. Generate Caption ────────────────────────────────────
app.post('/api/generate-caption', async (req, res) => {
  try {
    const { scriptContent, clientName, niche, aiModel, aiProvider } = req.body;
    if (!scriptContent) return res.status(400).json({ error: 'scriptContent is required' });

    const admin = getAdminClient();
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = getAiConfig(aiProvider, dbApiKey);
    const model = aiModel || 'gemini-2.5-flash';

    const prompt = `Você é um social media profissional brasileiro. Gere uma LEGENDA curta para Instagram.\nRegras: Máximo 200 chars, CTA, 1-3 emojis, sem hashtags.\n${clientName ? `CLIENTE: ${clientName}` : ''}\n${niche ? `NICHO: ${niche}` : ''}\nROTEIRO:\n${scriptContent}\n\nResponda APENAS com a legenda.`;

    let caption = '';
    if (ai.provider === 'gemini') {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.key}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300, temperature: 0.7 } }),
      });
      if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
      const data = await response.json();
      caption = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
      caption = await callAi(ai, model, [{ role: 'user', content: prompt }], { temperature: 0.7, max_tokens: 300 });
    }
    if (caption.length > 200) caption = caption.slice(0, 197) + '...';
    res.json({ caption });
  } catch (error) {
    console.error('Generate caption error:', error);
    res.status(500).json({ error: error.message });
  }
});


// ─── 5. Client Portal Auth ──────────────────────────────────
async function hashPassword(password) {
  // Use Node.js crypto module (crypto.subtle may not be available in all Node versions)
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(password + 'pulse_portal_salt_2026').digest('hex');
  return hash;
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
      // Search in client_portal_users first, fallback to clients table
      const { rows: [portalUser] } = await pool.query(
        `SELECT cpu.id as user_id, cpu.client_id, cpu.username, cpu.display_name, cpu.password_hash, c.company_name, c.color, c.logo_url
         FROM client_portal_users cpu
         JOIN clients c ON c.id = cpu.client_id
         WHERE cpu.username = $1`,
        [login.trim()]
      );
      if (portalUser) {
        const passwordHash = await hashPassword(password);
        if (portalUser.password_hash !== passwordHash) return res.status(401).json({ error: 'Senha incorreta' });
        return res.json({ success: true, client_id: portalUser.client_id, company_name: portalUser.company_name, color: portalUser.color, logo_url: portalUser.logo_url, display_name: portalUser.display_name, portal_user_id: portalUser.user_id });
      }
      // Fallback: legacy login on clients table
      const { rows: [client] } = await pool.query(
        `SELECT id, company_name, client_login, client_password_hash, color, logo_url FROM clients WHERE client_login = $1`,
        [login.trim()]
      );
      if (!client) return res.status(404).json({ error: 'Login não encontrado' });
      const passwordHash = await hashPassword(password);
      if (client.client_password_hash !== passwordHash) return res.status(401).json({ error: 'Senha incorreta' });
      return res.json({ success: true, client_id: client.id, company_name: client.company_name, color: client.color, logo_url: client.logo_url, display_name: client.company_name });
    }

    if (action === 'register') {
      if (!client_id || !login || !password) return res.status(400).json({ error: 'Dados incompletos' });
      // Check client exists
      const { rows: [clientRow] } = await pool.query(`SELECT id, company_name FROM clients WHERE id = $1`, [client_id]);
      if (!clientRow) return res.status(404).json({ error: 'Cliente não encontrado' });
      // Check username not taken
      const { rows: taken } = await pool.query(`SELECT id FROM client_portal_users WHERE username = $1`, [login.trim()]);
      if (taken.length > 0) return res.status(409).json({ error: 'Nome de usuário já em uso' });
      const passwordHash = await hashPassword(password);
      const name = (display_name || login).trim();
      await pool.query(
        `INSERT INTO client_portal_users (client_id, username, display_name, password_hash) VALUES ($1, $2, $3, $4)`,
        [client_id, login.trim(), name, passwordHash]
      );
      return res.json({ success: true, client_id, company_name: clientRow.company_name, display_name: name });
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
      // Count existing portal users for this client
      const { rows: [countRow] } = await pool.query(`SELECT count(*)::int as total FROM client_portal_users WHERE client_id = $1`, [data.id]);
      return res.json({ id: data.id, company_name: data.company_name, color: data.color, logo_url: data.logo_url, registered_users: countRow?.total || 0, weekly_reels: data.weekly_reels, weekly_creatives: data.weekly_creatives, weekly_stories: data.weekly_stories, monthly_recordings: data.monthly_recordings, plan_id: data.plan_id, show_metrics: data.show_metrics, has_vehicle_flyer: data.has_vehicle_flyer, niche: data.niche, whatsapp: data.whatsapp, city: data.city });
    }

    if (action === 'get_contents') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT * FROM client_portal_contents WHERE client_id = $1 ORDER BY created_at DESC`, [client_id]
      );
      return res.json({ contents: rows || [] });
    }

    if (action === 'list_users') {
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
      const { rows } = await pool.query(
        `SELECT id, company_name, responsible_person, color, logo_url, briefing_data
         FROM clients WHERE id = $1 LIMIT 1`, [clientId]
      );
      const client = rows[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

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
      const safePayload = {
        ...(briefing_data || {}),
        _clientId: clientId,
        _completed: true,
        _submittedAt: new Date().toISOString(),
        _version: nextVersion,
      };

      await pool.query(
        `UPDATE clients SET briefing_data = $1, editorial = $2, updated_at = now() WHERE id = $3`,
        [JSON.stringify(safePayload), editorial || '', clientId]
      );

      // Snapshot da versão
      try {
        await pool.query(
          `INSERT INTO briefing_versions (client_id, version, briefing_data, editorial, submitted_at)
           VALUES ($1, $2, $3, $4, now())`,
          [clientId, nextVersion, JSON.stringify(safePayload), editorial || '']
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
    await verifyUser(req);
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
    return res.json({ versions: rows });
  } catch (err) {
    console.error('briefing-versions error:', err);
    res.status(err?.status || 500).json({ error: err.message || 'Server error' });
  }
});
app.post('/api/public-proposal', async (req, res) => {
  try {
    await ensureProposalTables();
    const { action, token, proposal_id, author_name, message, status, response_note } = req.body;

    if (action === 'get_proposal') {
      if (!token) return res.status(400).json({ error: 'token required' });
      const { rows } = await pool.query('SELECT * FROM commercial_proposals WHERE token = $1 LIMIT 1', [token]);
      return res.json({ proposal: rows[0] || null });
    }

    if (action === 'get_clients') {
      const { rows } = await pool.query('SELECT id, company_name, logo_url, color FROM clients WHERE status = $1 ORDER BY company_name', ['ativo']);
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
      await pool.query(
        'UPDATE commercial_proposals SET status = $1, client_response_at = NOW(), client_response_note = $2 WHERE token = $3',
        [status, response_note || null, token]
      );
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
    const { action, client_id, content_id, author_name, author_type, author_id, message } = req.body;

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

    // ── Get portal contents ──
    if (action === 'get_contents') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        'SELECT * FROM client_portal_contents WHERE client_id = $1 ORDER BY created_at DESC',
        [client_id]
      );
      return res.json({ contents: rows });
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
      const { notification_id, notification_ids } = req.body;
      if (notification_id) {
        await pool.query('UPDATE client_portal_notifications SET read = true WHERE id = $1', [notification_id]);
      } else if (notification_ids && notification_ids.length > 0) {
        await pool.query('UPDATE client_portal_notifications SET read = true WHERE id = ANY($1)', [notification_ids]);
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
      await pool.query('UPDATE scripts SET client_priority = $1 WHERE id = $2', [priority || 'normal', script_id]);
      // Get client name for notifications
      if (client_id) {
        const { rows: [clientInfo] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
        return res.json({ success: true, company_name: clientInfo?.company_name || '' });
      }
      return res.json({ success: true });
    }

    // ── Get content tasks (for calendar) ──
    if (action === 'get_content_tasks') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: tasks } = await pool.query(
        `SELECT id, title, content_type, kanban_column, scheduled_recording_date, scheduled_recording_time,
                editing_started_at, editing_deadline, approval_sent_at, approved_at, adjustment_notes,
                recording_id, script_id, drive_link, updated_at, created_at
         FROM content_tasks WHERE client_id = $1`,
        [client_id]
      );
      // Get task history
      const taskIds = tasks.map(t => t.id);
      let history = [];
      if (taskIds.length > 0) {
        const { rows } = await pool.query(
          'SELECT id, task_id, action, details, created_at FROM task_history WHERE task_id = ANY($1) ORDER BY created_at ASC',
          [taskIds]
        );
        history = rows;
      }
      return res.json({ tasks, history });
    }

    // ── Get deliveries (for calendar) ──
    if (action === 'get_deliveries') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT id, title, content_type, status, delivered_at, posted_at, scheduled_time, platform
         FROM social_media_deliveries WHERE client_id = $1`,
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
      await pool.query('UPDATE flyer_items SET status = $1, updated_at = NOW() WHERE id = $2', [status, item_id]);
      return res.json({ success: true });
    }

    if (action === 'delete_flyer_item') {
      const { item_id } = req.body;
      if (!item_id) return res.status(400).json({ error: 'item_id required' });
      await pool.query('DELETE FROM flyer_items WHERE id = $1', [item_id]);
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
        `SELECT c.*, p.avatar_url FROM client_portal_comments c LEFT JOIN profiles p ON p.id = c.author_id WHERE c.content_id = $1 ORDER BY c.created_at ASC`,
        [content_id]
      );
      return res.json({ comments: rows });
    }

    if (action === 'add_comment') {
      if (!content_id || !message) return res.status(400).json({ error: 'content_id and message required' });
      await pool.query(
        `INSERT INTO client_portal_comments (content_id, author_name, author_type, author_id, message) VALUES ($1, $2, $3, $4, $5)`,
        [content_id, author_name || 'Cliente', author_type || 'client', author_id || null, message]
      );
      return res.json({ success: true });
    }

    if (action === 'approve') {
      if (!content_id) return res.status(400).json({ error: 'content_id required' });
      await pool.query(
        `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [content_id]
      );
      return res.json({ success: true });
    }

    if (action === 'request_adjustment') {
      if (!content_id || !message) return res.status(400).json({ error: 'content_id and message required' });
      await pool.query(
        `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW() WHERE id = $1`,
        [content_id]
      );
      await pool.query(
        `INSERT INTO client_portal_comments (content_id, author_name, author_type, author_id, message) VALUES ($1, $2, $3, $4, $5)`,
        [content_id, author_name || 'Cliente', author_type || 'client', author_id || null, `🔧 Ajuste solicitado: ${message}`]
      );
      return res.json({ success: true });
    }

    // ── Get single content by ID ──
    if (action === 'get_content_by_id') {
      if (!content_id) return res.status(400).json({ error: 'content_id required' });
      const { rows: [content] } = await pool.query('SELECT * FROM client_portal_contents WHERE id = $1', [content_id]);
      if (!content) return res.status(404).json({ error: 'Content not found' });
      return res.json({ content });
    }

    // ── Create portal content ──
    if (action === 'create_portal_content') {
      const { title, content_type, file_url, season_month, season_year, status } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
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
      await pool.query('INSERT INTO portal_video_views (video_id, client_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [video_id, client_id]);
      return res.json({ success: true });
    }


    // ── Client: Edit script ──
    if (action === 'client_edit_script') {
      const { script_id, content, caption } = req.body;
      if (!client_id || !script_id) return res.status(400).json({ error: 'client_id and script_id required' });

      const plainContent = String(content || '').trim();
      const htmlContent = plainContent ? `<p>${plainContent.replace(/\n/g, '</p><p>')}</p>` : '';

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
        'SELECT title FROM scripts WHERE id = $1 LIMIT 1',
        [script_id]
      );

      const { rows: notifUsers } = await pool.query(
        `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`
      );

      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [
            u.user_id,
            '✏️ Roteiro editado pelo cliente',
            `${client_name || 'Cliente'} editou o roteiro "${script?.title || 'Roteiro'}" no Pulse Club`,
            'info',
            '/roteiros',
          ]
        );
      }

      return res.json({ success: true });
    }

    // ── Sync: Approval ──
    if (action === 'sync_approval') {
      const { content_title } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      // Find matching content_task
      const { rows: [task] } = await pool.query(
        `SELECT id, assigned_to, script_id FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column IN ('envio', 'revisao', 'agendamentos') ORDER BY created_at DESC LIMIT 1`,
        [client_id, content_title]
      );
      if (task) {
        await pool.query(`UPDATE content_tasks SET kanban_column = 'agendamentos', approved_at = NOW(), updated_at = NOW() WHERE id = $1`, [task.id]);
        await pool.query(`INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`,
          [task.id, '✅ Aprovado pelo cliente via Pulse Club', null, null]);
      }
      // Notify social_media and admin
      const { rows: notifUsers } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsers) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, '✅ Conteúdo aprovado pelo cliente', `"${content_title}" foi aprovado no Pulse Club`, 'approval', '/conteudo']);
      }
      return res.json({ success: true });
    }

    // ── Sync: Adjustment ──
    if (action === 'sync_adjustment') {
      const { content_title, adjustment_note } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows: [task] } = await pool.query(
        `SELECT id, assigned_to FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column IN ('envio', 'revisao', 'agendamentos') ORDER BY created_at DESC LIMIT 1`,
        [client_id, content_title]
      );
      if (task) {
        await pool.query(`UPDATE content_tasks SET kanban_column = 'alteracao', adjustment_notes = $1, updated_at = NOW() WHERE id = $2`, [adjustment_note, task.id]);
        await pool.query(`INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`,
          [task.id, '🔧 Ajuste solicitado pelo cliente via Pulse Club', adjustment_note, null]);
        if (task.assigned_to) {
          await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
            [task.assigned_to, '🔧 Ajuste solicitado pelo cliente', `"${content_title}" precisa de ajustes: ${(adjustment_note || '').substring(0, 80)}`, 'adjustment', '/edicao/kanban']);
        }
      }
      const { rows: notifUsers } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsers) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, '🔧 Ajuste solicitado no Pulse Club', `Cliente solicitou ajuste em "${content_title}": ${(adjustment_note || '').substring(0, 80)}`, 'adjustment', '/entregas-social']);
      }
      return res.json({ success: true });
    }

    // ── Sync: Comment notification ──
    if (action === 'sync_comment') {
      const { content_title, author_name: syncAuthorName, author_type: syncAuthorType, message: syncMessage } = req.body;
      if (syncAuthorType === 'client') {
        const { rows: notifUsers } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
        for (const u of notifUsers) {
          await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
            [u.user_id, '💬 Comentário do cliente', `${syncAuthorName} comentou em "${content_title}": ${(syncMessage || '').substring(0, 60)}`, 'comment', '/conteudos-portal']);
        }
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
      const { rows: notifUsers } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsers) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, `${emoji} Roteiro marcado como ${label}`, `${client_name} marcou "${script_title}" como ${label} no Pulse Club`, 'priority', '/roteiros']);
      }
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

      const { rows: [task] } = await pool.query(
        `INSERT INTO design_tasks (client_id, title, description, format_type, priority, kanban_column, references_links)
         VALUES ($1, $2, $3, $4, 'media', 'nova_tarefa', $5) RETURNING id`,
        [client_id, title, description || null, format_type || 'feed', references_links || null]
      );

      // Add history
      await pool.query(
        `INSERT INTO design_task_history (task_id, action, details)
         VALUES ($1, $2, $3)`,
        [task.id, '📩 Solicitação criada pelo cliente via Pulse Club', description || null]
      );

      // Notify designers (fotografo + designer roles)
      const { rows: notifUsers } = await pool.query(
        `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'fotografo', 'designer')`
      );
      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, '🎨 Nova solicitação de arte do cliente', `${clientInfo?.company_name || 'Cliente'} solicitou: "${title}"`, 'design', '/designer']
        );
      }

      return res.json({ success: true, task_id: task.id });
    }

    // ── Approve design task from portal ──
    if (action === 'approve_design_task') {
      const { task_id } = req.body;
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      await pool.query(
        `UPDATE design_tasks SET kanban_column = 'aprovado', client_approved_at = NOW(), completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [task_id]
      );
      await pool.query(
        `INSERT INTO design_task_history (task_id, action) VALUES ($1, $2)`,
        [task_id, '✅ Aprovado pelo cliente via Pulse Club']
      );
      // Notify designers
      const { rows: notifUsers } = await pool.query(
        `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'fotografo', 'designer')`
      );
      const { rows: [taskInfo] } = await pool.query('SELECT title FROM design_tasks WHERE id = $1', [task_id]);
      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, '✅ Arte aprovada pelo cliente', `"${taskInfo?.title || 'Arte'}" foi aprovada no Pulse Club`, 'design', '/designer']
        );
      }
      return res.json({ success: true });
    }

    // ── Request design adjustment from portal ──
    if (action === 'request_design_adjustment') {
      const { task_id, note } = req.body;
      if (!task_id || !note) return res.status(400).json({ error: 'task_id and note required' });
      await pool.query(
        `UPDATE design_tasks SET kanban_column = 'ajustes', observations = $1, updated_at = NOW() WHERE id = $2`,
        [note, task_id]
      );
      await pool.query(
        `INSERT INTO design_task_history (task_id, action, details) VALUES ($1, $2, $3)`,
        [task_id, '🔧 Ajuste solicitado pelo cliente via Pulse Club', note]
      );
      // Notify designers
      const { rows: [taskInfo] } = await pool.query('SELECT title, assigned_to FROM design_tasks WHERE id = $1', [task_id]);
      const { rows: notifUsers } = await pool.query(
        `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'fotografo', 'designer')`
      );
      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, '🔧 Ajuste solicitado na arte', `Cliente pediu ajuste em "${taskInfo?.title || 'Arte'}": ${(note || '').substring(0, 80)}`, 'design', '/designer']
        );
      }
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

    // Ensure client_id column accepts NULL
    try {
      await pool.query(`ALTER TABLE content_tasks ALTER COLUMN client_id DROP NOT NULL`);
    } catch (_) { /* already nullable */ }

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

    // Ensure client_id column accepts NULL
    try {
      await pool.query(`ALTER TABLE content_tasks ALTER COLUMN client_id DROP NOT NULL`);
    } catch (_) { /* already nullable */ }

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
      const { rowCount } = await pool.query(
        `UPDATE content_tasks
         SET kanban_column = 'arquivado', approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND client_id IS NULL`,
        [task_id]
      );
      if (!rowCount) return res.status(404).json({ error: 'Vídeo avulso não encontrado' });
      await pool.query(
        `INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)`,
        [task_id, 'Cliente avulso aprovou o vídeo', null, null]
      );
      return res.json({ success: true });
    }

    if (action === 'request_revision') {
      if (!message) return res.status(400).json({ error: 'message required' });
      const { rowCount } = await pool.query(
        `UPDATE content_tasks
         SET kanban_column = 'alteracao', adjustment_notes = $2, editing_started_at = NULL,
             editing_paused_at = NULL, editing_paused_seconds = 0, updated_at = NOW()
         WHERE id = $1 AND client_id IS NULL`,
        [task_id, message]
      );
      if (!rowCount) return res.status(404).json({ error: 'Vídeo avulso não encontrado' });
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

// ─── 6. Portal Recordings (uses local PostgreSQL) ───────────
app.post('/api/portal-recordings', async (req, res) => {
  try {
    const { action, client_id, recording_id, new_date, new_time } = req.body;
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
      const { rows: [settings] } = await pool.query('SELECT * FROM company_settings LIMIT 1');
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
      const { rows: [rec] } = await pool.query('SELECT id, client_id, videomaker_id, date::text, start_time FROM recordings WHERE id = $1 AND client_id = $2', [recording_id, client_id]);
      if (!rec) return res.status(404).json({ error: 'Gravação não encontrada' });
      const { rows: [settings] } = await pool.query('SELECT recording_duration FROM company_settings LIMIT 1');
      const rawDurR = settings?.recording_duration || 2;
      const duration = rawDurR > 10 ? rawDurR : rawDurR * 60;
      const buffer = 30;
      const { rows: conflicts } = await pool.query(
        `SELECT id, start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada' AND id != $3`,
        [rec.videomaker_id, new_date, recording_id]
      );
      const [nh, nm] = new_time.split(':').map(Number);
      const newStart = nh * 60 + nm;
      const newEnd = newStart + duration + buffer;
      const hasConflict = conflicts.some(c => { const [ch, cm] = c.start_time.split(':').map(Number); const cStart = ch * 60 + cm; return newStart < cStart + duration + buffer && newEnd > cStart; });
      if (hasConflict) return res.status(409).json({ error: 'Horário não está mais disponível' });
      await pool.query(`UPDATE recordings SET date = $1, start_time = $2, confirmation_status = 'pendente' WHERE id = $3`, [new_date, new_time, recording_id]);
      const { rows: [clientInfo] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
      const notifMsg = `${clientInfo?.company_name || 'Cliente'} reagendou gravação de ${rec.date} ${rec.start_time} para ${new_date} ${new_time}`;
      // Notify admins and social_media via local notifications table
      const { rows: notifUsers } = await pool.query(
        `SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`
      );
      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, 'Reagendamento pelo cliente', notifMsg, 'warning', '/agenda']
        );
      }
      return res.json({ success: true });
    }

    /* ── confirm ── */
    if (action === 'confirm') {
      if (!recording_id) return res.status(400).json({ error: 'recording_id required' });
      await pool.query(`UPDATE recordings SET confirmation_status = 'confirmada' WHERE id = $1 AND client_id = $2`, [recording_id, client_id]);
      const { rows: [clientInfoConf] } = await pool.query('SELECT company_name FROM clients WHERE id = $1', [client_id]);
      const { rows: notifUsersConf } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsersConf) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, 'Gravação confirmada pelo cliente', `${clientInfoConf?.company_name || 'Cliente'} confirmou a gravação`, 'info', '/agenda']);
      }
      return res.json({ success: true });
    }

    /* ── cancel (with backup check + alternative videomakers) ── */
    if (action === 'cancel') {
      if (!recording_id) return res.status(400).json({ error: 'recording_id required' });
      const { rows: [recCancel] } = await pool.query('SELECT id, date::text, start_time, videomaker_id FROM recordings WHERE id = $1 AND client_id = $2', [recording_id, client_id]);
      if (!recCancel) return res.status(404).json({ error: 'Gravação não encontrada' });
      const { rows: [clientCancel] } = await pool.query('SELECT backup_day, backup_time, videomaker_id, company_name, fixed_day FROM clients WHERE id = $1', [client_id]);
      const { rows: [settingsCancel] } = await pool.query('SELECT * FROM company_settings LIMIT 1');
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
      let alternativeVideomakers = [];
      if (!backupAvailable && backupDateCancel) {
        const { rows: allVideomakers } = await pool.query(
          `SELECT p.id, p.name FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'videomaker' AND p.id != $1`,
          [clientCancel.videomaker_id]
        );
        const shiftAStart = settingsCancel?.shift_a_start || '08:30';
        const shiftAEnd = settingsCancel?.shift_a_end || '12:00';
        const shiftBStart = settingsCancel?.shift_b_start || '14:30';
        const shiftBEnd = settingsCancel?.shift_b_end || '18:00';

        for (const vm of allVideomakers) {
          const { rows: vmRecs } = await pool.query(
            `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
            [vm.id, backupDateCancel]
          );
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
      await pool.query(`UPDATE recordings SET status = 'cancelada' WHERE id = $1`, [recording_id]);
      const { rows: notifUsersCancel } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsersCancel) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, 'Gravação cancelada pelo cliente', `${clientCancel?.company_name || 'Cliente'} cancelou gravação ${recCancel.date} ${recCancel.start_time}`, 'warning', '/agenda']);
      }
      return res.json({ success: true, backup_available: backupAvailable, backup_slot: backupSlot, next_fixed_date: nextFixedDate, alternative_videomakers: alternativeVideomakers });
    }

    /* ── accept_backup ── */
    if (action === 'accept_backup') {
      const { backup_date, backup_time, videomaker_id: requestedVmId } = req.body;
      if (!backup_date || !backup_time) return res.status(400).json({ error: 'backup_date and backup_time required' });
      // Use requested videomaker_id (alternative) or fallback to client's default
      let vmId = requestedVmId || null;
      if (!vmId) {
        const { rows: [clientBackup] } = await pool.query('SELECT videomaker_id FROM clients WHERE id = $1', [client_id]);
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
      // Verify no conflict for selected videomaker/date/time
      const { rows: [settingsBackup] } = await pool.query('SELECT recording_duration FROM company_settings LIMIT 1');
      const rawDurB = settingsBackup?.recording_duration || 2;
      const durationBackup = rawDurB > 10 ? rawDurB : rawDurB * 60;
      const bufferBackup = 30;
      const { rows: conflictsBackup } = await pool.query(
        `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
        [vmId, backup_date]
      );
      const [nbh, nbm] = backup_time.split(':').map(Number);
      const newStartBackup = nbh * 60 + nbm;
      const hasConflictBackup = conflictsBackup.some(c => {
        const [ch, cm] = c.start_time.split(':').map(Number);
        const cStart = ch * 60 + cm;
        return newStartBackup < cStart + durationBackup + bufferBackup && newStartBackup + durationBackup + bufferBackup > cStart;
      });
      if (hasConflictBackup) return res.status(409).json({ error: 'Horário não está mais disponível' });
      await pool.query(`INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status) VALUES ($1, $2, $3, $4, 'secundaria', 'agendada', 'confirmada')`, [client_id, vmId, backup_date, backup_time]);
      return res.json({ success: true });
    }

    /* ── check_special_availability — smart wizard step ── */
    if (action === 'check_special_availability') {
      const { requested_date, requested_time } = req.body;
      if (!requested_date) return res.status(400).json({ error: 'requested_date required' });

      const { rows: [settings] } = await pool.query('SELECT * FROM company_settings LIMIT 1');
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
      const { rows: allVms } = await pool.query(
        `SELECT p.id, p.name FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE ur.role = 'videomaker'${mainVmId ? ' AND p.id != $1' : ''}`,
        mainVmId ? [mainVmId] : []
      );
      for (const vm of allVms) {
        const { rows: vmRecs } = await pool.query(`SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`, [vm.id, requested_date]);
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

      const { rows: [clientSpecial] } = await pool.query('SELECT company_name, videomaker_id FROM clients WHERE id = $1', [client_id]);
      let specialVmId = selected_videomaker_id || clientSpecial?.videomaker_id || null;

      if (!specialVmId) {
        const { rows: [lastClientRec] } = await pool.query(`SELECT videomaker_id FROM recordings WHERE client_id = $1 AND videomaker_id IS NOT NULL ORDER BY date DESC, created_at DESC LIMIT 1`, [client_id]);
        specialVmId = lastClientRec?.videomaker_id || null;
      }
      if (!specialVmId) {
        const { rows: [fallbackVm] } = await pool.query(
          `SELECT p.id FROM profiles p JOIN user_roles ur ON ur.user_id = p.id LEFT JOIN recordings r ON r.videomaker_id = p.id AND r.date = $1 AND r.status != 'cancelada' WHERE ur.role = 'videomaker' GROUP BY p.id, p.name ORDER BY COUNT(r.id) ASC, p.name ASC LIMIT 1`,
          [requested_date]
        );
        specialVmId = fallbackVm?.id || null;
      }
      if (!specialVmId) return res.status(400).json({ error: 'Nenhum videomaker disponível para esta solicitação' });

      const { rows: [newSpecialRec] } = await pool.query(
        `INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status) VALUES ($1, $2, $3, $4, 'extra', 'solicitada', 'pendente') RETURNING id`,
        [client_id, specialVmId, requested_date, requested_time || '09:00']
      );
      await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
        [client_id, '📨 Solicitação enviada', `Sua solicitação de gravação especial para ${requested_date} foi enviada para aprovação. Aguarde a confirmação da equipe.`, 'info']);
      const { rows: notifUsersSpecial } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media')`);
      for (const u of notifUsersSpecial) {
        await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, 'Solicitação de gravação especial', `${clientSpecial?.company_name || 'Cliente'}: ${comment} — Data: ${requested_date} ${requested_time || ''} — AGUARDANDO APROVAÇÃO`, 'warning', '/relacionamento']);
      }
      return res.json({ success: true, recording_id: newSpecialRec?.id });
    }

    /* ── approve_special ── */
    if (action === 'approve_special') {
      const { recording_id: approveRecId } = req.body;
      if (!approveRecId) return res.status(400).json({ error: 'recording_id required' });
      await pool.query(`UPDATE recordings SET status = 'agendada', confirmation_status = 'pendente' WHERE id = $1 AND status = 'solicitada'`, [approveRecId]);
      const { rows: [recApprove] } = await pool.query('SELECT client_id, date::text, start_time FROM recordings WHERE id = $1', [approveRecId]);
      if (recApprove) {
        await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
          [recApprove.client_id, '✅ Gravação aprovada!', `Sua solicitação de gravação especial para ${recApprove.date} às ${recApprove.start_time} foi aprovada pela equipe! Confirme sua presença.`, 'success']);
      }
      return res.json({ success: true });
    }

    /* ── reject_special ── */
    if (action === 'reject_special') {
      const { recording_id: rejectRecId, rejection_reason } = req.body;
      if (!rejectRecId || !rejection_reason) return res.status(400).json({ error: 'recording_id and rejection_reason required' });
      await pool.query(`UPDATE recordings SET status = 'cancelada' WHERE id = $1 AND status = 'solicitada'`, [rejectRecId]);
      const { rows: [recReject] } = await pool.query('SELECT client_id, date::text, start_time FROM recordings WHERE id = $1', [rejectRecId]);
      if (recReject) {
        await pool.query(`INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)`,
          [recReject.client_id, '❌ Solicitação não aprovada', `Sua solicitação de gravação para ${recReject.date} não pôde ser atendida: ${rejection_reason}`, 'warning']);
      }
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

function resolvePortalMediaLocalPath(targetUrl) {
  const parsed = new URL(targetUrl);
  const decodedPath = decodeURIComponent(parsed.pathname);
  const primaryPath = path.join('/var/www/html', decodedPath);
  const uploadsPath = primaryPath.replace('/var/www/html/uploads/', '/var/www/uploads/');

  if (fs.existsSync(primaryPath)) return primaryPath;
  if (fs.existsSync(uploadsPath)) return uploadsPath;
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

function warmPortal480pCache(sourcePath, cachedFile) {
  if (fs.existsSync(cachedFile)) return Promise.resolve(cachedFile);
  const existingJob = activePortalTranscodes.get(cachedFile);
  if (existingJob) return existingJob;

  const tempFile = `${cachedFile}.tmp`;
  const job = execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-vf', 'scale=-2:480',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    '-y', tempFile,
  ], { timeout: 120000 })
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

    const localSourcePath = resolvePortalMediaLocalPath(targetUrl);
    const isVideoFile = /\.(mp4|mov|webm)(\?|$)/i.test(targetUrl);

    if (quality === '480p' && isVideoFile && localSourcePath) {
      const urlHash = crypto.createHash('md5').update(targetUrl).digest('hex');
      const cachedFile = path.join(TRANSCODE_CACHE_DIR, `${urlHash}_480p.mp4`);

      if (fs.existsSync(cachedFile)) {
        return streamLocalPortalMedia(req, res, cachedFile, '480p-cached');
      }

      warmPortal480pCache(localSourcePath, cachedFile)
        .catch((error) => console.error('ffmpeg warmup error:', error.message));

      return streamLocalPortalMedia(req, res, localSourcePath, 'original-warming-480p');
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

app.post('/api/meta-oauth', async (req, res) => {
  try {
    const admin = getAdminClient();
    const { action, client_id, redirect_uri, code } = req.body;

    const { data: metaIntegration } = await admin.from('api_integrations').select('config').eq('provider', 'meta_ads').eq('status', 'ativo').limit(1).single();
    if (!metaIntegration) return res.status(400).json({ error: 'Meta integration not configured' });
    const config = metaIntegration.config;
    const appId = config?.meta_app_id;

    if (action === 'get_oauth_url') {
      if (!appId) return res.status(400).json({ error: 'Meta App ID not found' });
      const scopes = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';
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
      const connectedAccounts = [];
      await admin.from('social_accounts').delete().eq('client_id', client_id);

      for (const page of pages) {
        await admin.from('social_accounts').insert({ client_id, platform: 'facebook', facebook_page_id: page.id, account_name: page.name, access_token: page.access_token, status: 'connected', token_expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() });
        connectedAccounts.push({ platform: 'facebook', name: page.name, pageId: page.id });
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          await admin.from('social_accounts').insert({ client_id, platform: 'instagram', facebook_page_id: page.id, instagram_business_id: ig.id, account_name: ig.username || ig.name, access_token: page.access_token, status: 'connected', token_expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() });
          connectedAccounts.push({ platform: 'instagram', name: ig.username || ig.name, username: ig.username, businessId: ig.id, profilePicture: ig.profile_picture_url, pageId: page.id });
        }
        await admin.from('integration_logs').insert({ client_id, platform: 'facebook', action: 'oauth_connect', status: 'success', message: `Página ${page.name} conectada via OAuth.` });
      }
      return res.json({ success: true, accounts: connectedAccounts, pages_found: pages.length });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Meta OAuth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 9. Meta Publish ────────────────────────────────────────
async function fetchMetaWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    await new Promise(r => setTimeout(r, 200));
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
      let ready = false;
      for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 2000)); const sr = await fetchMetaWithRetry(`${META_API_BASE}/${cd.id}?fields=status_code&access_token=${pageToken}`, { method: 'GET' }); const sd = await sr.json(); if (sd.status_code === 'FINISHED') { ready = true; break; } if (sd.status_code === 'ERROR') throw new Error('Media processing failed'); }
      if (!ready) throw new Error('Media processing timed out');
      const pr = await fetchMetaWithRetry(`${META_API_BASE}/${igBusinessId}/media_publish?creation_id=${cd.id}&access_token=${pageToken}`, { method: 'POST' });
      result = await pr.json();
    } else if (publish_type === 'stories') {
      const isVideo = /\.(mp4|mov|webm)/i.test(media_url);
      const cp = new URLSearchParams({ media_type: 'STORIES', access_token: pageToken });
      if (isVideo) cp.set('video_url', media_url); else cp.set('image_url', media_url);
      const cr = await fetchMetaWithRetry(`${META_API_BASE}/${igBusinessId}/media?${cp}`, { method: 'POST' });
      const cd = await cr.json();
      if (isVideo) for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 2000)); const sr = await fetchMetaWithRetry(`${META_API_BASE}/${cd.id}?fields=status_code&access_token=${pageToken}`, { method: 'GET' }); const sd = await sr.json(); if (sd.status_code === 'FINISHED') break; if (sd.status_code === 'ERROR') throw new Error('Story video failed'); }
      const pr = await fetchMetaWithRetry(`${META_API_BASE}/${igBusinessId}/media_publish?creation_id=${cd.id}&access_token=${pageToken}`, { method: 'POST' });
      result = await pr.json();
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
    const { integration_id, secret_name, secret_value, meta_app_id, meta_app_secret, meta_page_token, meta_ig_business_id, meta_page_id } = req.body;

    if (secret_name && secret_value) {
      const keyToProviderMap = { GOOGLE_GEMINI_API_KEY: 'ai_gemini', OPENAI_API_KEY: 'ai_openai', ANTHROPIC_API_KEY: 'ai_claude' };
      const dbProvider = keyToProviderMap[secret_name];
      if (dbProvider) {
        const { data: existing } = await admin.from('api_integrations').select('id, config').eq('provider', dbProvider).limit(1).single();
        if (existing) {
          const cfg = existing.config || {};
          cfg.api_key_encrypted = secret_value;
          cfg.api_key_set = true;
          cfg.api_key_hint = '••••' + secret_value.slice(-4);
          await admin.from('api_integrations').update({ config: cfg, updated_at: new Date().toISOString() }).eq('id', existing.id);
        }
      }
      return res.json({ success: true, message: `Secret ${secret_name} stored` });
    }

    if (!integration_id) return res.status(400).json({ error: 'integration_id is required' });
    const { data: current } = await admin.from('api_integrations').select('config').eq('id', integration_id).single();
    const updatedConfig = { ...(current?.config || {}) };
    if (meta_app_id) updatedConfig.meta_app_id = meta_app_id;
    if (meta_app_secret) { updatedConfig.meta_app_secret_encrypted = meta_app_secret; updatedConfig.meta_app_secret = '••••' + meta_app_secret.slice(-4); }
    if (meta_page_token) { updatedConfig.meta_page_token_encrypted = meta_page_token; updatedConfig.meta_page_token = '••••' + meta_page_token.slice(-4); }
    if (meta_ig_business_id) updatedConfig.meta_ig_business_id = meta_ig_business_id;
    if (meta_page_id) updatedConfig.meta_page_id = meta_page_id;
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

// ─── 12. Reset Password ────────────────────────────────────
app.post('/api/reset-password', async (req, res) => {
  try {
    const { user, admin } = await verifyAdmin(req);
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'userId and newPassword (min 6 chars) required' });
    await storeUserPassword(userId, newPassword);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 13. Delete User ────────────────────────────────────────
app.post('/api/delete-user', async (req, res) => {
  try {
    const { user, admin } = await verifyAdmin(req);
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    if (userId === user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await admin.from('partners').delete().eq('user_id', userId);
    await admin.from('user_roles').delete().eq('user_id', userId);
    await admin.from('notifications').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('id', userId);
    await pool.query('DELETE FROM auth_users WHERE id::text = $1', [String(userId)]).catch(() => null);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 14. Client Onboarding ──────────────────────────────────
app.all('/api/client-onboarding', async (req, res) => {
  try {
    if (req.method === 'GET') {
      const clientId = req.query.clientId;
      if (!clientId) return res.status(400).json({ error: 'Missing clientId' });

      const { rows: clients } = await pool.query(
        `SELECT id, company_name, responsible_person, logo_url, onboarding_completed, videomaker_id,
                fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra,
                extra_content_types, extra_client_appears, plan_id, selected_weeks, client_type,
                photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data
         FROM clients WHERE id = $1`, [clientId]
      );
      const client = clients[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const { rows: videomakers } = await pool.query(
        `SELECT id, name, display_name, avatar_url, bio, job_title FROM profiles WHERE role = 'videomaker'`
      );
      const { rows: settingsRows } = await pool.query(`SELECT * FROM company_settings LIMIT 1`);
      const settings = settingsRows[0] || null;
      const { rows: existingClients } = await pool.query(
        `SELECT id, videomaker_id, fixed_day, fixed_time FROM clients WHERE videomaker_id IS NOT NULL`
      );

      let plan = null;
      if (client.plan_id) {
        const { rows: planRows } = await pool.query(
          `SELECT id, name, recording_sessions, accepts_extra_content FROM plans WHERE id = $1`, [client.plan_id]
        );
        plan = planRows[0] || null;
      }

      return res.json({ client, videomakers: videomakers || [], settings, existingClients: existingClients || [], plan });
    }

    // POST — full onboarding save logic
    const body = req.body;
    const { clientId, videomaker_id, fixed_day, fixed_time, backup_day, backup_time, monthly_recordings, accepts_extra, extra_content_types, extra_client_appears, selected_weeks, photo_preference, has_photo_shoot, accepts_photo_shoot_cost, briefing_data, full_shift_recording, preferred_shift } = body;
    if (!clientId || !videomaker_id || !fixed_day) return res.status(400).json({ error: 'Missing required fields' });
    if (!full_shift_recording && !fixed_time) return res.status(400).json({ error: 'Missing fixed_time' });

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

    let briefingUpdate = '';
    const vals = [updateFields.videomaker_id, updateFields.fixed_day, updateFields.fixed_time,
      updateFields.backup_day, updateFields.backup_time, updateFields.monthly_recordings,
      updateFields.accepts_extra, updateFields.extra_content_types, updateFields.extra_client_appears,
      updateFields.selected_weeks, updateFields.onboarding_completed,
      updateFields.photo_preference, updateFields.has_photo_shoot, updateFields.accepts_photo_shoot_cost,
      clientId, updateFields.full_shift_recording, updateFields.preferred_shift];

    let paramIdx = 18;
    let extraSets = '';
    if (briefing_data && Object.keys(briefing_data).length > 0) {
      extraSets += `, briefing_data = $${paramIdx}`;
      vals.push(JSON.stringify(briefing_data));
      paramIdx++;
      if (briefing_data.instagram_login) {
        extraSets += `, client_login = $${paramIdx}`;
        vals.push(briefing_data.instagram_login);
        paramIdx++;
      }
      if (briefing_data.niche) {
        extraSets += `, niche = $${paramIdx}`;
        vals.push(briefing_data.niche);
        paramIdx++;
      }
    }

    await pool.query(
      `UPDATE clients SET videomaker_id=$1, fixed_day=$2, fixed_time=$3,
       backup_day=$4, backup_time=$5, monthly_recordings=$6,
       accepts_extra=$7, extra_content_types=$8, extra_client_appears=$9,
       selected_weeks=$10, onboarding_completed=$11,
       photo_preference=$12, has_photo_shoot=$13, accepts_photo_shoot_cost=$14,
       full_shift_recording=$16, preferred_shift=$17,
       updated_at=now() ${extraSets}
       WHERE id=$15`, vals
    );

    // Create upcoming recordings
    const weeks = selected_weeks || [1, 2, 3, 4];
    const dayMap = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
    const targetDay = dayMap[fixed_day];
    if (targetDay !== undefined) {
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
      if (dates.length > 0) {
        const insertVals = dates.map((date, i) => {
          const base = i * 4;
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, 'fixa', 'agendada', 'pendente')`;
        }).join(', ');
        const insertParams = dates.flatMap(date => [clientId, videomaker_id, date, fixed_time]);
        await pool.query(
          `INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status) VALUES ${insertVals}`,
          insertParams
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Client onboarding error:', err);
    res.status(500).json({ error: err.message });
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
app.post('/api/billing-automation', async (req, res) => {
  try {
    const admin = getAdminClient();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const { data: contracts } = await admin.from('financial_contracts').select('*').eq('status', 'ativo');
    if (!contracts?.length) return res.json({ message: 'No active contracts' });
    const { data: paymentConfigs } = await admin.from('payment_config').select('*').limit(1);
    const paymentConfig = paymentConfigs?.[0];
    const { data: whatsappConfigs } = await admin.from('whatsapp_config').select('*').limit(1);
    const whatsappConfig = whatsappConfigs?.[0];
    const results = [];

    for (const contract of contracts) {
      if (contract.billing_enabled === false) continue;
      const isDueDay = currentDay === contract.due_day;
      const dueDate = new Date(currentYear, currentMonth, contract.due_day);
      const daysSinceDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const isReminder = daysSinceDue === 3;
      if (!isDueDay && !isReminder) continue;

      const { data: clientData } = await admin.from('clients').select('*').eq('id', contract.client_id).single();
      if (!clientData?.whatsapp) continue;
      const refMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const { data: existingRevenues } = await admin.from('revenues').select('*').eq('client_id', contract.client_id).eq('reference_month', refMonth);
      const revenue = existingRevenues?.[0];
      if (revenue?.status === 'recebida') continue;
      const { data: existingMessages } = await admin.from('billing_messages').select('*').eq('client_id', contract.client_id).gte('sent_at', todayStr + 'T00:00:00').lte('sent_at', todayStr + 'T23:59:59');
      if (existingMessages?.length) continue;

      const value = Number(contract.contract_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      let paymentInfo = '';
      if (paymentConfig?.pix_key) {
        const template = paymentConfig.msg_payment_data || '💳 *Dados:*\nNome: {nome_recebedor}\nBanco: {banco}\nPIX: {chave_pix}\nDoc: {documento}';
        paymentInfo = template.replace(/\{nome_recebedor\}/g, paymentConfig.receiver_name || '').replace(/\{banco\}/g, paymentConfig.bank || '').replace(/\{chave_pix\}/g, paymentConfig.pix_key || '').replace(/\{documento\}/g, paymentConfig.document || '');
      }

      const applyVars = tpl => tpl.replace(/\{nome_cliente\}/g, clientData.company_name).replace(/\{valor\}/g, value).replace(/\{dia_vencimento\}/g, String(contract.due_day)).replace(/\{dados_pagamento\}/g, paymentInfo);
      let message;
      if (isReminder) {
        message = applyVars(paymentConfig?.msg_billing_overdue || `Olá, {nome_cliente}! Identificamos pendência de {valor}. Se já pagou, desconsidere.{dados_pagamento}`);
        if (revenue) await admin.from('revenues').update({ status: 'em_atraso' }).eq('id', revenue.id);
      } else {
        message = applyVars(paymentConfig?.msg_billing_due || `Olá, {nome_cliente}! 🚀\n💰 Mensalidade: {valor}\n📅 Vencimento: Dia {dia_vencimento}{dados_pagamento}`);
      }

      if (whatsappConfig?.api_token && whatsappConfig?.integration_active) {
        try {
          await sendWhatsAppDirect(whatsappConfig, clientData.whatsapp, message, admin, contract.client_id, isReminder ? 'cobranca_lembrete' : 'cobranca');
          await admin.from('billing_messages').insert({ revenue_id: revenue?.id || null, client_id: contract.client_id, message_type: isReminder ? 'lembrete' : 'cobranca', status: 'enviada' });
          results.push({ client: clientData.company_name, type: isReminder ? 'lembrete' : 'cobranca', status: 'sent' });
        } catch (err) { results.push({ client: clientData.company_name, status: 'error', error: String(err) }); }
      }
    }
    res.json({ results, processed: results.length });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── 16. WhatsApp Webhook ───────────────────────────────────
const CONFIRM_WORDS = ['1', 'confirmar', 'confirmado', 'ok', 'sim', 'quero aproveitar', 'quero'];
const CANCEL_WORDS = ['2', 'cancelar', 'cancelado', 'não posso', 'nao posso', 'não', 'nao'];

function classifyResponse(text) {
  const n = text.trim().toLowerCase().replace(/[^\w\sáéíóúãõâêîôûç]/g, '');
  if (CONFIRM_WORDS.some(w => n === w || n.startsWith(w))) return 'confirm';
  if (CANCEL_WORDS.some(w => n === w || n.startsWith(w))) return 'cancel';
  return 'unknown';
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

app.post('/api/whatsapp-webhook', async (req, res) => {
  try {
    const admin = getAdminClient();
    const { phone: phoneNumber, message: messageText } = extractPayload(req.body);
    if (!phoneNumber || !messageText) return res.json({ ok: true, skipped: 'no_phone_or_message' });

    const phoneVariants = [phoneNumber];
    if (phoneNumber.startsWith('55') && phoneNumber.length > 10) phoneVariants.push(phoneNumber.slice(2));
    else phoneVariants.push('55' + phoneNumber);

    const { data: confirmations } = await admin.from('whatsapp_confirmations').select('*, recordings(*), clients(*)').in('phone_number', phoneVariants).eq('status', 'pending').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1);
    if (!confirmations?.length) return res.json({ ok: true, skipped: 'no_pending_confirmation' });

    const confirmation = confirmations[0];
    const recording = confirmation.recordings;
    const client = confirmation.clients;
    const classification = classifyResponse(messageText);
    if (classification === 'unknown') return res.json({ ok: true, skipped: 'unrecognized_response' });

    const { data: configData } = await admin.from('whatsapp_config').select('*').limit(1).single();
    if (!configData?.api_token) return res.status(400).json({ error: 'No API token' });

    const portalLink = `${PORTAL_BASE_URL}/${client?.id || ''}`;
    const templateVars = { nome_cliente: client?.company_name || '', data_gravacao: recording?.date || '', hora_gravacao: recording?.start_time || '', link_portal: portalLink };

    if (confirmation.type === 'confirmation') {
      if (classification === 'confirm') {
        await admin.from('whatsapp_confirmations').update({ status: 'confirmed', responded_at: new Date().toISOString(), response_message: messageText }).eq('id', confirmation.id);
        await admin.from('recordings').update({ confirmation_status: 'confirmada' }).eq('id', confirmation.recording_id);
        await sendWhatsAppDirect(configData, confirmation.phone_number, applyTemplate(configData.msg_confirmation_confirmed, templateVars), admin, client?.id, 'auto_confirmation');
      } else {
        await admin.from('whatsapp_confirmations').update({ status: 'cancelled', responded_at: new Date().toISOString(), response_message: messageText }).eq('id', confirmation.id);
        await admin.from('recordings').update({ status: 'cancelada', confirmation_status: 'cancelada' }).eq('id', confirmation.recording_id);
        await sendWhatsAppDirect(configData, confirmation.phone_number, applyTemplate(configData.msg_confirmation_cancelled, templateVars), admin, client?.id, 'auto_confirmation');
      }
    }

    res.json({ ok: true, classification, type: confirmation.type });
  } catch (error) {
    console.error('whatsapp-webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 17. Confirmation Cron ──────────────────────────────────
app.post('/api/whatsapp-confirmation-cron', async (req, res) => {
  try {
    const admin = getAdminClient();
    const { data: config } = await admin.from('whatsapp_config').select('*').limit(1).single();
    if (!config?.integration_active || !config?.api_token || !config?.auto_confirmation) return res.json({ ok: true, skipped: 'disabled' });

    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const { data: recordings } = await admin.from('recordings').select('*, clients(*)').eq('date', tomorrowStr).eq('status', 'agendada').eq('confirmation_status', 'pendente');
    if (!recordings?.length) return res.json({ ok: true, sent: 0 });

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
      const result = await sendWhatsAppDirect(config, client.whatsapp, message, admin, client.id, 'auto_confirmation');
      if (result.ok) sentCount++;
    }
    res.json({ ok: true, sent: sentCount, total: recordings.length });
  } catch (error) {
    console.error('confirmation-cron error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── 18. Approval Deadline Cron ─────────────────────────────
app.post('/api/approval-deadline-cron', async (req, res) => {
  try {
    const admin = getAdminClient();
    const now = new Date().toISOString();
    const { data: expiredTasks } = await admin.from('content_tasks').select('id, client_id, title, edited_video_link, approval_deadline').eq('kanban_column', 'envio').not('approval_deadline', 'is', null).lt('approval_deadline', now);
    if (!expiredTasks?.length) return res.json({ ok: true, moved: 0 });

    const { data: config } = await admin.from('whatsapp_config').select('*').limit(1).single();
    const clientIds = [...new Set(expiredTasks.map(t => t.client_id))];
    const { data: clientsData } = await admin.from('clients').select('id, company_name, whatsapp, responsible_person').in('id', clientIds);
    const clientsMap = {};
    (clientsData || []).forEach(c => { clientsMap[c.id] = c; });

    let movedCount = 0;
    for (const task of expiredTasks) {
      await admin.from('content_tasks').update({ kanban_column: 'agendamentos', approved_at: now, updated_at: now }).eq('id', task.id);
      await admin.from('social_media_deliveries').update({ status: 'entregue' }).eq('content_task_id', task.id);
      const client = clientsMap[task.client_id];
      await admin.rpc('notify_role', { _role: 'social_media', _title: 'Aprovação expirada', _message: `"${task.title}" (${client?.company_name || ''}) não foi aprovado em 6h. Movido para agendamento.`, _type: 'deadline', _link: '/entregas-social' });

      if (config?.integration_active && config?.api_token && client?.whatsapp) {
        const portalLink = `${PORTAL_BASE_URL}/${task.client_id}`;
        const msg = applyTemplate(config.msg_approval_expired || 'Olá, {nome_cliente}! O vídeo "{titulo}" foi encaminhado para agendamento.', { nome_cliente: client.responsible_person || client.company_name, titulo: task.title, link_portal: portalLink });
        await sendWhatsAppDirect(config, client.whatsapp, msg, admin, task.client_id, 'auto_approval_expired');
      }
      movedCount++;
    }
    res.json({ ok: true, moved: movedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── 19. Generate Monthly Revenues ──────────────────────────
app.post('/api/generate-monthly-revenues', async (req, res) => {
  try {
    const admin = getAdminClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const refMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const { data: contracts } = await admin.from('financial_contracts').select('*').eq('status', 'ativo');
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
    const admin = getAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const { data: configData } = await admin.from('whatsapp_config').select('api_token, integration_active').limit(1).single();
    if (!configData?.api_token || !configData.integration_active) return res.status(400).json({ error: 'WhatsApp não configurado' });

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
      const result = await sendWhatsAppDirect({ api_token: configData.api_token }, phone, message, admin, partnerTasks[0].client_id, 'endo_daily_tasks');
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
  'recording_wait_logs','portal_videos','portal_video_views','commercial_proposals','proposal_comments','scheduled_recordings',
  'event_recordings','client_testimonials','proposal_checklist_items','holidays',
  'tv_settings','fieldwork_activities',
  'training_presentations','training_slides',
  'training_tracks','training_modules','training_lessons','user_training_progress',
  'user_permissions','login_logs',
  'campaigns','campaign_slots',
  'story_editing_sessions','script_requests','manual_video_tasks','plan_promotions',
  'client_professionals','client_units','short_links',


];

// ═══════════════════════════════════════════════════════════════
// MULTI-CITY ENFORCEMENT
// ═══════════════════════════════════════════════════════════════
// Tabelas que devem ser filtradas pela cidade ativa do usuário
const TABLES_WITH_CITY = new Set([
  'clients','recordings','kanban_tasks','scripts','active_recordings',
  'content_tasks','task_history','task_comments',
  'design_tasks','design_task_history','delivery_records',
  'revenues','expenses','financial_contracts','financial_activity_log',
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
  'recording_wait_logs','portal_videos','portal_video_views',
  'commercial_proposals','proposal_comments','event_recordings',
  'client_testimonials','proposal_checklist_items',
  'fieldwork_activities','goals','notifications',
  'company_settings','whatsapp_config','payment_config',
  'crm_leads','crm_notes','goals','notifications',
  'plans',
  'story_editing_sessions','script_requests','manual_video_tasks',
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
  const linkedUserIds = await getLinkedUserIds(userObj || { id: userId });

  // Admins podem acessar qualquer cidade sem precisar de registro em user_cities
  try {
    if (userObj && await isAdminUser(userObj)) {
      return assertValidCity(requestedValid || 'minacu');
    }
  } catch (e) {
    if (e && e.statusCode === 400) throw e;
    /* segue fluxo normal */
  }

  try {
    const { rows } = await pool.query(
      'SELECT city, is_primary FROM user_cities WHERE user_id::text = ANY($1::text[])',
      [linkedUserIds.length ? linkedUserIds : [String(userId)]]
    );
    if (rows.length === 0) return assertValidCity(requestedValid || 'minacu');
    const allowed = rows.map(r => normalizeCityValue(r.city)).filter(Boolean);
    if (requestedValid && allowed.includes(requestedValid)) return requestedValid;
    const primary = normalizeCityValue(rows.find(r => r.is_primary)?.city);
    return assertValidCity(primary || allowed[0]);
  } catch (e) {
    if (e && e.statusCode === 400) throw e;
    return assertValidCity(requestedValid || 'minacu');
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

function qualifyBaseSelectClause(selectClause, baseTable, joins = []) {
  const raw = String(selectClause || '*').trim();
  if (!raw || raw === '*') return `${baseTable}.*`;

  const joinTables = new Set(
    (Array.isArray(joins) ? joins : [])
      .map((join) => sanitizeIdentifier(join?.table || ''))
      .filter(Boolean)
  );

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === '*') return `${baseTable}.*`;
      if (part.includes('.') || part.includes('(') || part.includes(')')) return part;

      const aliasMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
      if (aliasMatch) {
        const column = sanitizeIdentifier(aliasMatch[1]);
        const alias = sanitizeIdentifier(aliasMatch[2]);
        if (joinTables.has(column)) return part;
        return `${baseTable}.${column} AS ${alias}`;
      }

      const safeColumn = sanitizeIdentifier(part);
      return safeColumn ? `${baseTable}.${safeColumn}` : part;
    })
    .join(', ');
}

function isCrmLeadManagementPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const restrictedFields = new Set(['name', 'company', 'email', 'phone', 'contract_value']);
  return Object.keys(data).some((key) => restrictedFields.has(key));
}


// Generic query endpoint
app.post('/api/db/query', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { table, operation, data, filters, select, order, limit: queryLimit, single, joins, onConflict } = req.body;

    const safeTable = sanitizeIdentifier(table);
    if (!ALLOWED_TABLES.includes(safeTable)) {
      return res.status(403).json({ error: `Table "${safeTable}" is not allowed` });
    }

    if (safeTable === 'profiles') {
      await ensureProfilesMonthlySalaryColumn().catch((error) => {
        console.warn('Could not ensure profiles.monthly_salary before generic query:', error?.message || error);
      });
    }

    if (safeTable === 'client_professionals' || safeTable === 'client_units') {
      await ensureClientDatabaseTables().catch((error) => {
        console.warn('Could not ensure client database tables:', error?.message || error);
      });
    }



    if (safeTable === 'commercial_proposals' || safeTable === 'proposal_comments') {
      await ensureProposalTables();
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

    if (safeTable === 'scheduled_recordings') {

      await ensureScheduledRecordingsTable();
    }

    if (safeTable === 'short_links' || safeTable === 'short_link_clicks') {
      await ensureShortLinksTables();
    }

    // Multi-city: resolve cidade ativa e prepara flag de scoping
    // Só aplica se a tabela estiver na lista E realmente tiver a coluna `city` no DB.
    const scopeCity = TABLES_WITH_CITY.has(safeTable) && await tableHasCityColumn(safeTable);
    const activeCity = scopeCity ? await resolveActiveCity(req, user.id, user) : null;

    let result;


    switch (operation) {
      case 'select': {
        if (safeTable === 'crm_leads') {
          await ensureCrmLeadsColumns();
        }
        const selectClause = joins && Array.isArray(joins)
          ? qualifyBaseSelectClause(select || '*', safeTable, joins)
          : (select || '*');
        let query = `SELECT ${selectClause} FROM ${safeTable}`;

        const params = [];
        let paramIdx = 1;

        // Handle joins
        if (joins && Array.isArray(joins)) {
          for (const join of joins) {
            const joinTable = sanitizeIdentifier(join.table);
            if (!ALLOWED_TABLES.includes(joinTable)) continue;
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

        // Handle filters
        if (filters && Array.isArray(filters)) {
          const whereClauses = [];
          for (const f of filters) {
            const col = sanitizeIdentifier(f.column);
            switch (f.op) {
              case 'eq': whereClauses.push(`${safeTable}.${col} = $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'neq': whereClauses.push(`${safeTable}.${col} != $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'gt': whereClauses.push(`${safeTable}.${col} > $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'gte': whereClauses.push(`${safeTable}.${col} >= $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'lt': whereClauses.push(`${safeTable}.${col} < $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'lte': whereClauses.push(`${safeTable}.${col} <= $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'like': whereClauses.push(`${safeTable}.${col} LIKE $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'ilike': whereClauses.push(`${safeTable}.${col} ILIKE $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'is': whereClauses.push(`${safeTable}.${col} IS ${f.value === null ? 'NULL' : 'NOT NULL'}`); break;
              case 'in': whereClauses.push(`${safeTable}.${col} = ANY($${paramIdx})`); params.push(f.value); paramIdx++; break;
              case 'contains': whereClauses.push(`${safeTable}.${col} @> $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'or': {
                const orClauses = [];
                for (const part of splitOrFilterParts(f.value)) {
                  const [rawColumn, rawOp, ...rawValueParts] = part.split('.');
                  const orColumn = sanitizeIdentifier(rawColumn || '');
                  const orOp = String(rawOp || '').trim();
                  const rawValue = rawValueParts.join('.');
                  if (!orColumn || !orOp) continue;

                  switch (orOp) {
                    case 'eq':
                      orClauses.push(`${safeTable}.${orColumn} = $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'neq':
                      orClauses.push(`${safeTable}.${orColumn} != $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'gt':
                      orClauses.push(`${safeTable}.${orColumn} > $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'gte':
                      orClauses.push(`${safeTable}.${orColumn} >= $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'lt':
                      orClauses.push(`${safeTable}.${orColumn} < $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'lte':
                      orClauses.push(`${safeTable}.${orColumn} <= $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'like':
                      orClauses.push(`${safeTable}.${orColumn} LIKE $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'ilike':
                      orClauses.push(`${safeTable}.${orColumn} ILIKE $${paramIdx}`);
                      params.push(rawValue);
                      paramIdx++;
                      break;
                    case 'is':
                      orClauses.push(`${safeTable}.${orColumn} IS ${rawValue === 'null' ? 'NULL' : 'NOT NULL'}`);
                      break;
                    case 'in':
                      orClauses.push(`${safeTable}.${orColumn} = ANY($${paramIdx})`);
                      params.push(parseFilterArray(rawValue));
                      paramIdx++;
                      break;
                  }
                }
                if (orClauses.length > 0) whereClauses.push(`(${orClauses.join(' OR ')})`);
                break;
              }
              case 'not': {
                const nestedOp = f.value?.op;
                const nestedValue = f.value?.value;
                if (nestedOp === 'is') {
                  whereClauses.push(`${safeTable}.${col} IS ${nestedValue === null ? 'NOT NULL' : 'NULL'}`);
                } else if (nestedOp === 'in') {
                  whereClauses.push(`NOT (${safeTable}.${col} = ANY($${paramIdx}))`);
                  params.push(parseFilterArray(nestedValue));
                  paramIdx++;
                } else {
                  whereClauses.push(`${safeTable}.${col} != $${paramIdx}`);
                  params.push(nestedValue);
                  paramIdx++;
                }
                break;
              }
            }
          }
          if (whereClauses.length > 0) query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Multi-city: força filtro de cidade no SELECT
        if (scopeCity) {
          query += (query.includes(' WHERE ') ? ' AND ' : ' WHERE ') + `${cityVisibilityExpression(`${safeTable}.city`, `$${paramIdx}`)}`;
          params.push(activeCity);
          paramIdx++;
        }


        // Handle order
        if (order) {
          const orderParts = Array.isArray(order) ? order : [order];
          const orderClauses = orderParts.map(o => `${sanitizeOrderColumn(o.column, safeTable)} ${o.ascending === false ? 'DESC' : 'ASC'}`);
          query += ` ORDER BY ${orderClauses.join(', ')}`;
        }

        // Handle limit
        if (queryLimit) query += ` LIMIT ${parseInt(queryLimit)}`;

        const { rows } = await pool.query(query, params);
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
          // Se está inserindo um content_task para um cliente + tipo que já tem placeholder
          // (kanban_column='ideias', sem script e sem gravação), reutiliza esse card via UPDATE
          // ao invés de criar um novo. Evita cópias fantasmas na Zona de Ideias.
          if (
            safeTable === 'content_tasks' &&
            itemScoped &&
            itemScoped.client_id &&
            itemScoped.content_type &&
            (itemScoped.kanban_column || 'ideias') !== 'arquivado'
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

          const { rows } = await pool.query(
            `INSERT INTO ${safeTable} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})
             ON CONFLICT (${(conflictColumns.length ? conflictColumns : ['id']).join(', ')}) DO UPDATE SET ${updateSet}
             RETURNING *`,
            values
          );
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
        }


        const scopedData = scopeCity
          ? { ...data, city: assertValidCity(activeCity) }
          : (data && data.city !== undefined ? { ...data, city: assertValidCity(data.city) } : data);

        if (safeTable === 'crm_leads' && (scopedData.meeting_date || scopedData.meeting_time || scopedData.status === 'meeting')) {
          const leadId = filters?.find(f => f.column === 'id' && f.op === 'eq')?.value;
          const { rows: currentLead } = await pool.query(`SELECT meeting_date, meeting_time, status FROM crm_leads WHERE id = $1`, [leadId]);
          
          const mDate = scopedData.meeting_date || currentLead[0]?.meeting_date;
          const mTime = scopedData.meeting_time || currentLead[0]?.meeting_time;
          const status = scopedData.status || currentLead[0]?.status;

          if (status === 'meeting') {
            await validateMeetingConflict(mDate, mTime, leadId);
          }
        }

        const existingColumns = await getExistingColumns(safeTable);
        const entries = Object.entries(scopedData)
          .map(([key, value]) => [sanitizeIdentifier(key), value])
          .filter(([key]) => !existingColumns || existingColumns.has(key));
        if (entries.length === 0) {
          result = { data: [], error: null };
          break;
        }
        const keys = entries.map(([key]) => key);
        const jsonColumns = await getTableJsonColumns(safeTable);
        const values = entries.map(([key, value]) => serializeValueForColumn(key, value, jsonColumns));
        let paramIdx = 1;
        const setClauses = keys.map(k => `${k} = $${paramIdx++}`);

        let query = `UPDATE ${safeTable} SET ${setClauses.join(', ')}`;
        const params = [...values];

        if (filters && Array.isArray(filters)) {
          const whereClauses = [];
          for (const f of filters) {
            const col = sanitizeIdentifier(f.column);
            if (f.op === 'eq') { whereClauses.push(`${col} = $${paramIdx}`); params.push(f.value); paramIdx++; }
            else if (f.op === 'in') { whereClauses.push(`${col} = ANY($${paramIdx})`); params.push(f.value); paramIdx++; }
          }
          if (whereClauses.length > 0) query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        // Multi-city: impede UPDATE cruzado
        if (scopeCity) {
          query += (query.includes(' WHERE ') ? ' AND ' : ' WHERE ') + `${cityVisibilityExpression('city', `$${paramIdx}`)}`;
          params.push(activeCity);
          paramIdx++;
        }
        query += ' RETURNING *';

        const { rows } = await pool.query(query, params);
        
        // Broadcaster: Notificações globais de status de lead
        if (safeTable === 'crm_leads' && rows.length > 0) {
          for (const lead of rows) {
            if (lead.status === 'contracted') {
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
        let paramIdx = 1;

        if (filters && Array.isArray(filters)) {
          const whereClauses = [];
          for (const f of filters) {
            const col = sanitizeIdentifier(f.column);
            switch (f.op) {
              case 'eq': whereClauses.push(`${col} = $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'neq': whereClauses.push(`${col} != $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'gt': whereClauses.push(`${col} > $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'gte': whereClauses.push(`${col} >= $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'lt': whereClauses.push(`${col} < $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'lte': whereClauses.push(`${col} <= $${paramIdx}`); params.push(f.value); paramIdx++; break;
              case 'in': whereClauses.push(`${col} = ANY($${paramIdx})`); params.push(f.value); paramIdx++; break;
            }
          }
          if (whereClauses.length > 0) query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
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
        // Call a database function
        const funcName = sanitizeIdentifier(data.function_name);
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

    res.json(result);
  } catch (e) {
    console.error('DB query error:', e);
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ data: null, error: { message: e.message } });
  }
});

// ═══════════════════════════════════════════════════════════════
// CRUD ROUTES — Phase 4: Direct DB access (replaces Supabase SDK)
// ═══════════════════════════════════════════════════════════════

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

    const { rows } = await pool.query(
      `SELECT
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

    res.set('Cache-Control', 'private, max-age=10');
    res.json(data);
  } catch (e) {
    console.error('GET /api/design-tasks/fast error:', e);
    res.status(e.message === 'Unauthorized' ? 401 : 500).json({ error: e.message });
  }
});

// ─── Clients ────────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    const { rows } = scopeCity
      ? await pool.query(`SELECT * FROM clients WHERE ${cityVisibilityExpression('city', '$1')} ORDER BY company_name`, [activeCity])
      : await pool.query('SELECT * FROM clients ORDER BY company_name');
    res.json(rows);
  } catch (e) { res.status(e.message === 'Unauthorized' ? 401 : 500).json({ error: e.message }); }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    const c = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clients (id, company_name, responsible_person, phone, color, logo_url, fixed_day, fixed_time,
        videomaker_id, backup_time, backup_day, extra_day, extra_content_types, accepts_extra, extra_client_appears,
        whatsapp, whatsapp_group, email, city, weekly_reels, weekly_creatives, weekly_goal, has_endomarketing,
        has_vehicle_flyer, weekly_stories, presence_days, monthly_recordings, niche, client_login,
        drive_link, drive_fotos, drive_identidade_visual, editorial, plan_id, contract_start_date,
        contract_duration_months, auto_renewal, selected_weeks, has_photo_shoot, accepts_photo_shoot_cost,
        briefing_data, show_metrics, photo_preference, client_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44)
       RETURNING *`,
      [
        c.id || crypto.randomUUID(), c.company_name, c.responsible_person || '', c.phone || '', c.color || '217 91% 60%',
        c.logo_url || null, c.fixed_day || 'segunda', c.fixed_time || '09:00', c.videomaker_id || null,
        c.backup_time || '14:00', c.backup_day || 'terca', c.extra_day || 'quarta',
        c.extra_content_types || '{}', c.accepts_extra ?? false, c.extra_client_appears ?? false,
        c.whatsapp || '', c.whatsapp_group || null, c.email || '', assertValidCity(scopeCity ? activeCity : (c.city || 'minacu')),
        c.weekly_reels ?? 0, c.weekly_creatives ?? 0, c.weekly_goal ?? 10, c.has_endomarketing ?? false,
        c.has_vehicle_flyer ?? false, c.weekly_stories ?? 0, c.presence_days ?? 1, c.monthly_recordings ?? 4,
        c.niche || '', c.client_login || '', c.drive_link || '', c.drive_fotos || '',
        c.drive_identidade_visual || '', c.editorial || '', c.plan_id || null, c.contract_start_date || null,
        c.contract_duration_months ?? 12, c.auto_renewal ?? false, c.selected_weeks || '{1,2,3,4}',
        c.has_photo_shoot ?? false, c.accepts_photo_shoot_cost ?? false,
        c.briefing_data ? JSON.stringify(c.briefing_data) : '{}', c.show_metrics ?? true,
        c.photo_preference || 'nao_precisa', c.client_type || 'novo'
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /api/clients error:', e);
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
};

app.get('/api/clients/:id/transfer-preview', async (req, res) => {
   try {
     const { id } = req.params;

     // Admins podem visualizar previews sem validar activeCity rigorosamente
     await verifyUser(req);

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
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'clients');
    const { id } = req.params;
    const c = req.body;
    
    // First, get the current client data to check the existing city
    const { rows: currentRows } = await pool.query('SELECT city FROM clients WHERE id = $1', [id]);
    const oldCity = currentRows[0]?.city;
    let newCityRaw = c.city;
    if (newCityRaw) newCityRaw = normalizeCityValue(newCityRaw);
    const newCity = newCityRaw ? assertValidCity(newCityRaw) : undefined;

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
      'extra_client_appears','whatsapp','whatsapp_group','email','city','weekly_reels','weekly_creatives',
      'weekly_goal','has_endomarketing','has_vehicle_flyer','weekly_stories','presence_days',
      'monthly_recordings','niche','client_login','drive_link','drive_fotos','drive_identidade_visual',
      'editorial','plan_id','contract_start_date','contract_duration_months','auto_renewal',
      'selected_weeks','has_photo_shoot','accepts_photo_shoot_cost','briefing_data','show_metrics',
      'photo_preference','client_type','onboarding_completed'
    ];
    const sets = []; const vals = [];
    let idx = 1;
    for (const key of allowed) {
      if (c[key] !== undefined) {
        let value = c[key];
        if (key === 'city') value = newCity;
        if (key === 'briefing_data') value = JSON.stringify(c[key]);
        sets.push(`${key} = $${idx}`);
        vals.push(value);
        idx++;
      }
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    let whereSql = `WHERE id = $${idx}`;

    // Detecta transferência de cidade ANTES de montar o escopo.
    const normalizedOldCity = normalizeCityValue(oldCity);
    const isCityTransfer = Boolean(newCity && normalizedOldCity && newCity !== normalizedOldCity);

    // Em uma transferência, o frontend envia o header `x-pulse-city` já com a
    // cidade de DESTINO. Se aplicássemos esse escopo no WHERE, o cliente (ainda
    // na cidade de origem) não seria encontrado e o UPDATE afetaria 0 linhas —
    // exatamente o bug de "passou todas as etapas mas nada mudou". Por isso, em
    // transferências o escopo usa a cidade de ORIGEM.
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
        console.log(`[Cascading-City-Update] Transferring client ${id} from ${normalizedOldCity} to ${newCity}`);
        
        for (const tableName of TABLES_WITH_CITY) {
          if (tableName === 'clients') continue;
          
          const hasCity = await tableHasCityColumn(tableName);
          if (!hasCity) continue;
          
          const existingColumns = await getExistingColumns(tableName);
          if (existingColumns.has('client_id')) {
            await client.query(
              `UPDATE ${tableName} SET city = $1 WHERE client_id = $2`,
              [newCity, id]
            );
          }
        }
      }
      
      await client.query('COMMIT');
      res.json(rows[0]);

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
  } catch (e) { console.error('DELETE /api/clients error:', e); res.status(500).json({ error: e.message }); }
});

// ─── Recordings ─────────────────────────────────────────────
app.get('/api/recordings', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
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
      ${scopeCity ? `WHERE ${cityVisibilityExpression('r.city', '$1')}` : ''}
      ORDER BY r.date DESC, r.start_time ASC
    `, scopeCity ? [activeCity] : []);

    res.json(rows.map(({ effective_status, ...recording }) => ({
      ...recording,
      status: effective_status || recording.status,
    })));
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/recordings', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const schemaResult = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'recordings'
        AND column_name IN ('client_id', 'prospect_name')
    `);
    const hasProspectName = schemaResult.rows.some((row) => row.column_name === 'prospect_name');
    const clientIdNullable = schemaResult.rows.some((row) => row.column_name === 'client_id' && row.is_nullable === 'YES');

    const results = [];
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
      const { rows } = await pool.query(
        `INSERT INTO recordings (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      results.push(rows[0]);
    }
    res.json(results.length === 1 ? results[0] : results);
  } catch (e) {
    console.error('POST /api/recordings error:', e);
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

app.put('/api/recordings/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const { id } = req.params;
    const r = req.body;
    const schemaResult = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'recordings'
        AND column_name IN ('client_id', 'prospect_name')
    `);
    const hasProspectName = schemaResult.rows.some((row) => row.column_name === 'prospect_name');
    const clientIdNullable = schemaResult.rows.some((row) => row.column_name === 'client_id' && row.is_nullable === 'YES');
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
    res.json(rows[0]);
  } catch (e) {
    const status = e?.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

app.delete('/api/recordings/:id', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const id = req.params.id;
    // Cascade: remove dependent records first
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [id]);
    await pool.query('DELETE FROM delivery_records WHERE recording_id = $1', [id]);
    await pool.query('DELETE FROM recording_wait_logs WHERE recording_id = $1', [id]);
    // Remove content_tasks linked to this recording (and their history/deliveries)
    const { rows: linkedTasks } = await pool.query('SELECT id FROM content_tasks WHERE recording_id = $1', [id]);
    if (linkedTasks.length > 0) {
      const taskIds = linkedTasks.map(t => t.id);
      await pool.query('DELETE FROM task_history WHERE task_id = ANY($1)', [taskIds]);
      await pool.query('DELETE FROM social_media_deliveries WHERE content_task_id = ANY($1)', [taskIds]);
      await pool.query('DELETE FROM content_tasks WHERE recording_id = $1', [id]);
    }
    // Mark linked scripts as not recorded
    await pool.query("UPDATE scripts SET recorded = false, updated_at = NOW() WHERE recording_id = $1", [id]);
    await pool.query(
      `DELETE FROM recordings WHERE id = $1${scopeCity ? ` AND ${cityVisibilityExpression('city', '$2')}` : ''}`,
      scopeCity ? [id, activeCity] : [id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk delete future recordings for a client
app.delete('/api/recordings/future/:clientId', async (req, res) => {
  try {
    const { activeCity, scopeCity } = await getScopedCityContext(req, 'recordings');
    const today = new Date().toISOString().split('T')[0];
    const { rowCount } = await pool.query(
      `DELETE FROM recordings WHERE client_id = $1 AND status = 'agendada' AND date >= $2${scopeCity ? ` AND ${cityVisibilityExpression('city', '$3')}` : ''}`,
      scopeCity ? [req.params.clientId, today, activeCity] : [req.params.clientId, today]
    );
    res.json({ deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// ─── Company Settings ───────────────────────────────────────
app.get('/api/company-settings', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
    res.json(rows[0] || null);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.put('/api/company-settings/:id', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { id } = req.params;
    const s = req.body;
    const allowed = ['shift_a_start','shift_a_end','shift_b_start','shift_b_end','work_days','recording_duration','editing_deadline_hours','review_deadline_hours','alteration_deadline_hours','approval_deadline_hours'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) { if (s[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(key === 'work_days' ? s[key] : s[key]); idx++; } }
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

// Stop active recording with delivery record creation
app.post('/api/active-recordings/:recordingId/stop', async (req, res) => {
  try {
    await verifyUser(req);
    const { recordingId } = req.params;
    const { deliveryOverrides, completedScriptIds } = req.body;
    
    const { rows: activeRows } = await pool.query('SELECT * FROM active_recordings WHERE recording_id = $1', [recordingId]);
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [recordingId]);
    
    const active = activeRows[0];
    if (active) {
      await pool.query(
        `INSERT INTO delivery_records (recording_id, client_id, videomaker_id, date, reels_produced, creatives_produced, stories_produced, arts_produced, extras_produced, videos_recorded, delivery_status, observations)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [recordingId, active.client_id, active.videomaker_id, new Date().toISOString().split('T')[0],
         deliveryOverrides?.reels_produced ?? 0, deliveryOverrides?.creatives_produced ?? 0,
         deliveryOverrides?.stories_produced ?? 0, deliveryOverrides?.arts_produced ?? 0,
         deliveryOverrides?.extras_produced ?? 0, deliveryOverrides?.videos_recorded ?? 1,
         'realizada', 'Registro automático ao finalizar gravação']
      );
      
      if (completedScriptIds?.length > 0) {
        for (const scriptId of completedScriptIds) {
          const { rows: scriptRows } = await pool.query('SELECT title, content_format FROM scripts WHERE id = $1', [scriptId]);
          const script = scriptRows[0];
          await pool.query(
            `INSERT INTO social_media_deliveries (client_id, content_type, title, status, delivered_at, script_id, recording_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [active.client_id, script?.content_format || 'reels', script?.title || 'Vídeo gravado',
             'entregue', new Date().toISOString().split('T')[0], scriptId, recordingId, active.videomaker_id]
          );
        }
      }

      // Roteiros planejados que NÃO foram gravados voltam para "ideias"
      // (e desvinculam do recording para sumir da captação dessa gravação)
      const planned = Array.isArray(active.planned_script_ids) ? active.planned_script_ids : [];
      const completed = new Set(completedScriptIds || []);
      const notRecorded = planned.filter(id => !completed.has(id));
      if (notRecorded.length > 0) {
        await pool.query(
          `UPDATE content_tasks
             SET kanban_column = 'ideias',
                 recording_id = NULL,
                 drive_link = NULL,
                 updated_at = NOW()
           WHERE script_id = ANY($1::uuid[])
             AND kanban_column IN ('captacao', 'captacao_concluida', 'aguardando_link')`,
          [notRecorded]
        );
        // Garante que os scripts não fiquem marcados como gravados
        await pool.query(
          `UPDATE scripts SET recorded = false, recording_id = NULL, updated_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [notRecorded]
        );
      }
    }
    res.json({ success: true });
  } catch (e) { console.error('POST /api/active-recordings/stop error:', e); res.status(500).json({ error: e.message }); }
});

// ─── Production Assistant (AI Mascot) ──────────────────────
app.post('/api/production-assistant', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const admin = getAdminClient();
    if (!admin) return res.status(500).json({ error: 'DB not available' });
    const { context, aiModel, aiProvider } = req.body;
    if (!context) return res.status(400).json({ error: 'Context is required' });

    const selectedModel = aiModel || 'gemini-2.5-flash';
    const dbApiKey = await fetchDbApiKey(admin, aiProvider);
    const ai = getAiConfig(aiProvider, dbApiKey);

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

    const message = await callAi(ai, selectedModel, messages, { temperature: 0.8, max_tokens: 300 });
    res.json({ message });
  } catch (error) {
    // Sem chave de IA configurada não é um erro de servidor: responde 200 desativado
    // para não poluir os logs com stack traces a cada polling do front-end.
    if (String(error?.message || '').includes('Nenhuma API key de IA')) {
      return res.json({ message: null, disabled: true, reason: 'ai_not_configured' });
    }
    console.error('Production assistant error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Repair missing content_tasks for completed recordings ──
app.post('/api/repair-content-tasks', async (req, res) => {
  try {
    await verifyUser(req);
    const { recording_id } = req.body;
    const contentTasksClientIdNullable = await hasNullableClientIdOnContentTasks();

    // Find recording
    let recordings;
    if (recording_id) {
      const { rows } = await pool.query('SELECT * FROM recordings WHERE id = $1', [recording_id]);
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
        )
        ORDER BY r.date DESC LIMIT 20
      `);
      recordings = rows;
    }

    const created = [];
    for (const rec of recordings) {
      const clientId = rec.client_id;
      const isAvulso = !clientId;
      if (isAvulso && !contentTasksClientIdNullable) continue;

      // Find recorded scripts linked to this recording
      const { rows: recScripts } = await pool.query(
        `SELECT s.* FROM scripts s
         WHERE (s.recording_id = $1 OR s.client_id = $2)
         AND s.recorded = true
         AND NOT EXISTS (SELECT 1 FROM content_tasks ct WHERE ct.script_id = s.id)`,
        [rec.id, clientId]
      );

      for (const script of recScripts) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 48);
        const description = isAvulso
          ? `📹 VÍDEO AVULSO${rec.prospect_name ? ` — Prospect: ${rec.prospect_name}` : ''}\n\nRoteiro gravado pelo videomaker. Reparado automaticamente.`
          : `Roteiro gravado pelo videomaker. Reparado automaticamente.`;
        const { rows: inserted } = await pool.query(
          `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, script_id, recording_id, drive_link, editing_deadline, created_by)
           VALUES ($1, $2, $3, 'edicao', $4, $5, $6, $7, $8, $9) RETURNING id, title`,
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
    await verifyUser(req);
    const { title_search, drive_link } = req.body;
    const contentTasksClientIdNullable = await hasNullableClientIdOnContentTasks();

    // Find recording by searching for matching scripts or client names
    const { rows: matchingRecordings } = await pool.query(`
      SELECT r.*, c.company_name FROM recordings r
      LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.status = 'concluida'
      AND r.date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY r.date DESC
    `);

    // Find scripts matching the title
    const { rows: matchingScripts } = await pool.query(
       `SELECT s.*, r.client_id as rec_client_id, r.id as rec_id, r.prospect_name FROM scripts s
       LEFT JOIN recordings r ON r.id = s.recording_id
       WHERE s.title ILIKE $1 AND s.recorded = true`,
      [`%${title_search}%`]
    );

    // Check if content_task already exists
    const { rows: existingTasks } = await pool.query(
      `SELECT * FROM content_tasks WHERE title ILIKE $1`,
      [`%${title_search}%`]
    );

    if (existingTasks.length > 0) {
      // Task exists — update it to edicao if needed
      const task = existingTasks[0];
      if (drive_link) {
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
        `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, script_id, recording_id, drive_link, editing_deadline)
         VALUES ($1, $2, $3, 'edicao', $4, $5, $6, $7, $8) RETURNING *`,
        [
          clientId,
          script.title,
          script.content_format || 'reels',
          description,
          script.id,
          script.rec_id || script.recording_id || null,
          drive_link || null,
          deadline.toISOString(),
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
          `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, drive_link, recording_id, editing_deadline)
           VALUES ($1, $2, 'reels', 'edicao', $3, $4, $5, $6) RETURNING *`,
          [
            rec.client_id,
            title_search,
            `Conteúdo reparado. Link dos materiais: ${drive_link || 'N/A'}`,
            drive_link || null,
            rec.id,
            deadline.toISOString(),
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
function generateCouponCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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

    const whatsappToken = process.env.WHATSAPP_API_TOKEN;
    if (whatsappToken) {
      const cleanPhone = phone.replace(/\D/g, '');
      const whatsPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const message = `🎉 Parabéns ${name}!\n\nVocê resgatou um cupom de *${discountText}* na *${campInfo.company_name}*!\n\n🎟️ Seu código: *${claimed[0].code}*\n\nApresente este código no caixa para validar seu desconto.\n\n_Clube de Descontos Pulse_`;

      try {
        const formData = new FormData();
        formData.append('number', whatsPhone);
        formData.append('message', message);
        await fetch('https://api.atendeclique.com.br/api/send-message', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${whatsappToken}` },
          body: formData,
        });
      } catch (whatsErr) {
        console.error('WhatsApp notification error:', whatsErr);
      }
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
app.get('/api/discount-stats/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
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
      coupons,
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
  try {
    const { client_id, title, description, discount_type, discount_value, min_purchase_value, total_coupons, expires_at, created_by } = req.body;
    if (!client_id || !title || !total_coupons) {
      return res.status(400).json({ error: 'client_id, title e total_coupons são obrigatórios' });
    }

    const { rows: [campaign] } = await pool.query(
      `INSERT INTO discount_campaigns (client_id, title, description, discount_type, discount_value, min_purchase_value, total_coupons, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [client_id, title, description || '', discount_type || 'percentage', discount_value || 0, min_purchase_value || 0, total_coupons, expires_at || null, created_by || null]
    );

    // Generate coupons
    const codes = new Set();
    while (codes.size < total_coupons) {
      codes.add(generateCouponCode());
    }

    for (const code of codes) {
      await pool.query(
        `INSERT INTO discount_coupons (campaign_id, code) VALUES ($1, $2)`,
        [campaign.id, code]
      );
    }

    // Notify existing coupon holders from this client that new coupons are available
    const { rows: existingClaimants } = await pool.query(
      `SELECT DISTINCT dc2.claimed_by_phone, dc2.claimed_by_name
       FROM discount_coupons dc2
       JOIN discount_campaigns dcamp ON dcamp.id = dc2.campaign_id
       WHERE dcamp.client_id = $1 AND dc2.claimed_by_phone IS NOT NULL AND dc2.status != 'available'`,
      [client_id]
    );

    const whatsappToken = process.env.WHATSAPP_API_TOKEN;
    if (whatsappToken && existingClaimants.length > 0) {
      const { rows: [clientInfo] } = await pool.query(`SELECT company_name FROM clients WHERE id = $1`, [client_id]);
      const storeName = clientInfo?.company_name || 'Loja parceira';

      for (const claimant of existingClaimants) {
        const cleanPhone = claimant.claimed_by_phone.replace(/\D/g, '');
        const whatsPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        const message = `🎁 Novidade no Clube de Descontos!\n\n${claimant.claimed_by_name}, a *${storeName}* acabou de lançar novos cupons de desconto!\n\n📌 *${title}*\n\nCorra e garanta o seu antes que acabe! 🏃‍♂️\n\n_Clube de Descontos Pulse_`;

        try {
          const formData = new FormData();
          formData.append('number', whatsPhone);
          formData.append('message', message);
          await fetch('https://api.atendeclique.com.br/api/send-message', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${whatsappToken}` },
            body: formData,
          });
        } catch (whatsErr) {
          console.error('WhatsApp new campaign notification error:', whatsErr);
        }
      }
    }

    res.json({ campaign, coupons_generated: total_coupons });
  } catch (e) {
    console.error('POST /api/discount-campaigns error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: toggle campaign active status
app.patch('/api/discount-campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const { rows: [updated] } = await pool.query(
      `UPDATE discount_campaigns SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, is_active]
    );
    res.json({ campaign: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
app.post('/api/seasonal-alerts', async (req, res) => {
  try {
    const clientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds : [];
    const seasonalClients = await loadSeasonalClients(clientIds);
    const alerts = await fetchSystemSeasonalAlerts({ clientIds, fallbackClients: seasonalClients });
    res.json({ alerts });
  } catch (err) {
    console.error('[seasonal-alerts] proxy error:', err?.message);
    res.json({ alerts: [] });
  }
});

// Also support GET for simpler calls
app.get('/api/seasonal-alerts', async (req, res) => {
  try {
    const seasonalClients = await loadSeasonalClients();
    const alerts = await fetchSystemSeasonalAlerts({ fallbackClients: seasonalClients });
    res.json({ alerts });
  } catch (err) {
    console.error('[seasonal-alerts] proxy error:', err?.message);
    res.json({ alerts: [] });
  }
});



app.get('/api/presence', (req, res) => {
  res.json({ users: collectOnlinePresenceUsers() });
});

app.post('/api/presence/heartbeat', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const now = new Date().toISOString();
  const existing = presenceState.get(userId);
  presenceState.set(userId, {
    userId,
    heartbeatAt: now,
    connectedAt: existing?.connectedAt || now,
  });
  // Broadcast to WebSocket clients
  broadcastPresence();
  res.json({ ok: true });
});

app.post('/api/presence/leave', (req, res) => {
  const { userId } = req.body;
  if (userId) presenceState.delete(userId);
  broadcastPresence();
  res.json({ ok: true });
});

// ─── Quick Chat REST endpoint ──────────────────────────────
app.post('/api/quick-chat', (req, res) => {
  const { fromUserId, toUserId, message } = req.body;
  if (!fromUserId || !toUserId || !message) {
    return res.status(400).json({ error: 'fromUserId, toUserId, message required' });
  }
  const payload = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromUserId,
    toUserId,
    message,
    createdAt: new Date().toISOString(),
  };
  // Broadcast to all WS clients
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
    console.error('[training/stream] error:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

// ─── WebSocket Server for real-time presence & chat ─────────

// WebSocketServer already uses the global server instance initialized at the top

const wss = new WebSocketServer({ server, path: '/api/realtime' });

wss.on('connection', (ws) => {
  wssClients.add(ws);
  ws.on('close', () => wssClients.delete(ws));
  ws.on('error', () => wssClients.delete(ws));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        // Auth already handled by verifyUser on first REST call, 
        // we keep it simple for now as it's a internal local network VPS.
        ws.subscribedChannels = ws.subscribedChannels || new Set();
        ws.subscribedChannels.add(data.channel);
      }
    } catch (e) {}
  });
});

const wssOffice = new WebSocketServer({ server, path: '/ws/office' });

const wsClients = new Set();

function broadcastPresence() {
  const online = collectOnlinePresenceUsers();
  const msg = JSON.stringify({ type: 'presence_sync', users: online });
  for (const ws of wsClients) {
    try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
  }
}

function broadcastQuickMessage(payload) {
  const msg = JSON.stringify({ type: 'quick_message', payload });
  for (const ws of wsClients) {
    try { if (ws.readyState === 1) ws.send(msg); } catch { /* ignore */ }
  }
}

wssOffice.on('connection', (ws) => {
  wsClients.add(ws);

  // Send current presence immediately
  const online = collectOnlinePresenceUsers();
  ws.send(JSON.stringify({ type: 'presence_sync', users: online }));

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'heartbeat' && data.userId) {
        const existing = presenceState.get(data.userId);
        presenceState.set(data.userId, {
          userId: data.userId,
          heartbeatAt: new Date().toISOString(),
          connectedAt: existing?.connectedAt || new Date().toISOString(),
        });
        broadcastPresence();
      } else if (data.type === 'leave' && data.userId) {
        presenceState.delete(data.userId);
        broadcastPresence();
      } else if (data.type === 'quick_message') {
        broadcastQuickMessage(data.payload);
      }
    } catch { /* ignore malformed messages */ }
  });

  ws.on('close', () => { wsClients.delete(ws); });
  ws.on('error', () => { wsClients.delete(ws); });
});

// ─── Generic Realtime Channel Relay (WebSocket) ─────────
// Client (src/lib/vpsDb.ts ChannelBuilder) connects to /realtime,
// sends { type:'subscribe', channel, token, events } then
// { type:'broadcast', channel, event, payload }.
// Server relays broadcast frames to every other socket subscribed to that channel.

const realtimeWss = new WebSocketServer({ server, path: '/realtime' });
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

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    if (!data || typeof data !== 'object') return;

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

    if (data.type === 'broadcast' && typeof data.channel === 'string' && typeof data.event === 'string') {
      // Ensure sender is subscribed so they receive future broadcasts too
      if (!ws._pulseChannels?.has(data.channel)) subscribeSocketToChannel(ws, data.channel);
      relayBroadcast(data.channel, data.event, data.payload, ws);
      return;
    }

    if (data.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong', t: Date.now() })); } catch { /* ignore */ }
    }
  });

  ws.on('close', () => { unsubscribeSocketFromAll(ws); });
  ws.on('error', () => { unsubscribeSocketFromAll(ws); });
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
    const { months = [], clientId = null, allClients = true, contentTypes = [] } = req.body;
    if (!Array.isArray(months) || months.length === 0 || months.some(month => !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))) {
      return res.status(400).json({ error: 'Selecione ao menos um mês válido' });
    }
    
    const deletedCount = await cleanupOldPortalVideos({
      months,
      clientId,
      allClients,
      contentTypes: Array.isArray(contentTypes) ? contentTypes : [],
      olderThanDays: months.length > 0 ? null : 60
    });

    res.json({ success: true, deletedCount, freedBytes: lastCleanupStats.freedBytes });

  } catch (error) {
    console.error('bulk-delete error:', error);
    const message = error?.message || 'Erro interno';
    const status = error?.status || (/unauthorized|token|jwt/i.test(message) ? 401 : 500);
    res.status(status).json({ error: status === 401 ? 'Sessão expirada. Faça login novamente.' : message });
  }
});

/**
 * Varredura de órfãos: remove do disco todo arquivo em /uploads/ que não é
 * mais referenciado por nenhum registro do banco. Resolve o caso em que a
 * linha foi deletada, mas o arquivo continuou ocupando espaço na VPS.
 * `dryRun: true` apenas relata, sem apagar.
 */
app.post('/api/portal-videos/sweep-orphans', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    if (!(await userHasAssignedRole(user, 'admin'))) {
      return res.status(403).json({ error: 'Acesso restrito ao administrador' });
    }
    const dryRun = req.body?.dryRun === true;

    // Todas as URLs ainda referenciadas em qualquer tabela relevante.
    const referenced = new Set();
    const sources = [
      'SELECT file_url AS u FROM client_portal_contents WHERE file_url IS NOT NULL',
      'SELECT thumbnail_url AS u FROM client_portal_contents WHERE thumbnail_url IS NOT NULL',
      'SELECT edited_video_link AS u FROM content_tasks WHERE edited_video_link IS NOT NULL',
      'SELECT raw_video_link AS u FROM content_tasks WHERE raw_video_link IS NOT NULL',
      'SELECT file_url AS u FROM design_tasks WHERE file_url IS NOT NULL',
      'SELECT video_url AS u FROM portal_videos WHERE video_url IS NOT NULL',
    ];
    for (const sql of sources) {
      try {
        const { rows } = await pool.query(sql);
        for (const row of rows) {
          const rel = uploadRelativePath(row.u);
          if (rel) referenced.add(rel);
        }
      } catch {
        // Coluna/tabela inexistente nesta instalação — ignora com segurança.
      }
    }

    const skipDirs = new Set(['training-videos']);
    let deletedFiles = 0;
    let freedBytes = 0;
    let scanned = 0;

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
          if (skipDirs.has(entry.name)) continue;
          walk(root, full);
          continue;
        }
        const rel = path.relative(root, full).split(path.sep).join('/');
        scanned += 1;
        if (referenced.has(rel)) continue;
        try {
          const size = fs.statSync(full).size;
          if (!dryRun) fs.unlinkSync(full);
          deletedFiles += 1;
          freedBytes += size;
        } catch (error) {
          console.warn('[sweep] falha ao remover:', full, error?.message || error);
        }
      }
    };

    for (const root of uploadRoots()) {
      if (fs.existsSync(root)) walk(root, root);
    }

    res.json({
      success: true,
      dryRun,
      scanned,
      deletedFiles,
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
async function ensurePublicReschedTable() {
  if (publicReschedTableReady) return publicReschedTableReady;
  publicReschedTableReady = (async () => {
    try {
      await pool.query(`
        ALTER TABLE recordings
          ADD COLUMN IF NOT EXISTS rescheduled_to_id uuid REFERENCES recordings(id) ON DELETE SET NULL
      `);
    } catch (e) { console.warn('ensurePublicReschedTable:', e?.message || e); }
  })();
  return publicReschedTableReady;
}

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

    // If already rescheduled, return that info (idempotent)
    let alreadyBooked = null;
    if (rec.rescheduled_to_id) {
      const { rows: [nr] } = await pool.query(
        `SELECT id, date::text, start_time FROM recordings WHERE id = $1`, [rec.rescheduled_to_id]
      );
      if (nr) alreadyBooked = { id: nr.id, date: nr.date, start_time: nr.start_time };
    }

    const { rows: [settings] } = await pool.query('SELECT * FROM company_settings LIMIT 1');
    const rawDur = settings?.recording_duration || 2;
    const duration = rawDur > 10 ? rawDur : rawDur * 60;

    if (action === 'info' || !action) {
      // Build next 14 days of slots for this videomaker (current + next week)
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        const { rows: existing } = await pool.query(
          `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
          [rec.videomaker_id, dateStr]
        );
        const slots = computeVmSlots(existing, settings, duration);
        days.push({ date: dateStr, weekday: d.getDay(), slots });
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

    async function createBackup(newDate, newTime) {
      // Conflict recheck
      const { rows: existing } = await pool.query(
        `SELECT start_time FROM recordings WHERE videomaker_id = $1 AND date = $2 AND status != 'cancelada'`,
        [rec.videomaker_id, newDate]
      );
      const buffer = 30;
      const [nh, nm] = newTime.split(':').map(Number);
      const ns = nh * 60 + nm; const ne = ns + duration + buffer;
      const conflict = existing.some(c => { const [ch, cm] = c.start_time.split(':').map(Number); const cs = ch * 60 + cm; return ns < cs + duration + buffer && ne > cs; });
      if (conflict) { const err = new Error('Horário não está mais disponível.'); err.status = 409; throw err; }

      const { rows: [newRec] } = await pool.query(
        `INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status)
         VALUES ($1, $2, $3, $4, 'backup', 'agendada', 'confirmada')
         RETURNING id, date::text, start_time`,
        [rec.client_id, rec.videomaker_id, newDate, newTime]
      );
      await pool.query(`UPDATE recordings SET rescheduled_to_id = $1 WHERE id = $2`, [newRec.id, rec.id]);

      // Notify team
      const msg = `${rec.company_name} reagendou (via link) para ${newDate} ${newTime}`;
      const { rows: notifUsers } = await pool.query(`SELECT ur.user_id FROM user_roles ur WHERE ur.role IN ('admin', 'social_media', 'videomaker')`);
      for (const u of notifUsers) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [u.user_id, 'Reagendamento por link', msg, 'info', '/agenda']
        );
      }
      return newRec;
    }

    if (action === 'book') {
      if (!date || !time) return res.status(400).json({ error: 'date e time requeridos' });
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
      const nr = await createBackup(target, rec.fixed_time || '08:30');
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
      const folder = sanitizeUploadFolder(req.body?.folder);
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

const uploadHandler = multer({
  storage: uploadStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

function uploadErrorStatus(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return 413;
  if (error?.code === 'ENOSPC') return 507;
  return 500;
}

app.get('/api/upload-health', (_req, res) => {
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
app.post('/api/admin/repair-atomic', async (req, res) => {
  try {
    // Nota: O endpoint de reparo deve ser público ou usar uma chave secreta no header
    // para permitir recuperação quando o JWT está expirado/inválido.
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

app.post('/api/upload', (req, res) => {
  uploadHandler.single('file')(req, res, async (err) => {
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
        url: `/uploads/${relative}`,
      });
    } catch (error) {
      console.error('[upload:process] error:', error);
      res.status(500).json({ error: 'Erro ao processar metadados do upload' });
    }
  });
});

app.delete('/api/upload', express.json(), (req, res) => {
  try {
    const raw = String(req.body?.path || '').replace(/^\/+/, '').replace(/^uploads\//, '');
    const relative = sanitizeUploadFolder(raw);
    if (!relative) return res.status(400).json({ error: 'Caminho inválido' });

    const abs = path.resolve(UPLOAD_ROOT, relative);
    if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) return res.status(400).json({ error: 'Caminho inválido' });
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    res.json({ success: true });
  } catch (error) {
    console.error('[upload:delete] error:', error);
    res.status(500).json({ error: error.message || 'Falha ao remover arquivo' });
  }
});

app.post('/api/crm/harvest/search', async (req, res) => {
  try {
    const { city, niche, min_capital } = req.body;
    
    // Dataset simulado (Mock) conforme solicitado no plano
    const mockCompanies = [
      { id: '1', razao_social: 'Engenharia de Alimentos S.A.', contato: 'Joana Silva', email: 'contato@engalimentos.com.br', telefone: '62998887766', atuacao: 'Indústria Alimentícia', endereco: 'Rua das Indústrias, 45 - Setor Industrial', capital_social: 1500000, cidade: 'Minaçu' },
      { id: '2', razao_social: 'Supermercado Central', contato: 'Pedro Oliveira', email: 'vendas@central.com.br', telefone: '6233774411', atuacao: 'Varejo', endereco: 'Av. Brasil, 1020 - Centro', capital_social: 500000, cidade: 'Uruaçu' },
      { id: '3', razao_social: 'Construtora Vale do Sol', contato: 'Marcos Santos', email: 'diretoria@valedosol.com', telefone: '6298112233', atuacao: 'Construção Civil', endereco: 'Rua das Flores, s/n', capital_social: 2500000, cidade: 'Minaçu' },
      { id: '4', razao_social: 'Agropecuária Rebanho Forte', contato: 'Zeca Boiadeiro', email: 'contato@rebanhoforte.agr.br', telefone: '6299114455', atuacao: 'Agronegócio', endereco: 'Fazenda Rebanho, KM 12', capital_social: 5000000, cidade: 'Uruaçu' },
      { id: '5', razao_social: 'Oficina do Grau', contato: 'Beto Mecânico', email: 'oficinagrau@gmail.com', telefone: '6233558899', atuacao: 'Serviços Automotivos', endereco: 'Av. dos Operários, 300', capital_social: 120000, cidade: 'Minaçu' },
      { id: '6', razao_social: 'Clínica Sorriso Aberto', contato: 'Dra. Maria Clara', email: 'agendamento@sorrisoaberto.com', telefone: '6298556622', atuacao: 'Saúde', endereco: 'Rua Médica, 10', capital_social: 800000, cidade: 'Uruaçu' },
    ];

    let filtered = mockCompanies;
    if (city && city !== 'all') filtered = filtered.filter(c => c.cidade === city);
    if (niche && niche !== 'all') filtered = filtered.filter(c => c.atuacao.toLowerCase().includes(niche.toLowerCase()));
    if (min_capital) filtered = filtered.filter(c => c.capital_social >= Number(min_capital));

    res.json({ data: filtered });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cron-like task for CRM meeting reminders
setInterval(async () => {
  try {
    // Busca reuniões agendadas para amanhã (24h de antecedência) que ainda não tiveram lembrete enviado
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const { rows: pendingReminders } = await pool.query(
      `SELECT id, name, phone, meeting_time, company 
       FROM crm_leads 
       WHERE status = 'meeting' 
         AND meeting_date = $1 
         AND reminder_sent_24h = FALSE 
         AND phone IS NOT NULL`,
      [tomorrowStr]
    );

    for (const lead of pendingReminders) {
      console.log(`[CRM-Reminder] Sending reminder to ${lead.name} (${lead.phone}) for meeting at ${lead.meeting_time}`);
      
      // Aqui integraria com a API de WhatsApp (ex: Evolution API ou Z-API)
      // Por enquanto simulamos o envio e marcamos como enviado no banco
      const message = `Olá ${lead.name}, aqui é da Agência Pulse! Passando para confirmar nossa reunião de amanhã às ${lead.meeting_time?.slice(0, 5)}. Podemos confirmar?`;
      
      // Mock de envio bem sucedido
      await pool.query(
        `UPDATE crm_leads SET reminder_sent_24h = TRUE WHERE id = $1`,
        [lead.id]
      );
    }
  } catch (err) {
    console.error('[CRM-Reminder-Error]', err);
  }
}, 1000 * 60 * 60); // Roda a cada 1 hora

// ─── Start ──────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🚀 Pulse API Server running on port ${PORT} (HTTP + WebSocket)`);
});


/*
 * .env required variables:
 * 
 * GOOGLE_GEMINI_API_KEY=<your_gemini_key>
 * WHATSAPP_API_TOKEN=<your_whatsapp_token>
 * API_PORT=3002
 * 
 * Optional:
 * OPENAI_API_KEY=<if using OpenAI>
 * ANTHROPIC_API_KEY=<if using Claude>
 */

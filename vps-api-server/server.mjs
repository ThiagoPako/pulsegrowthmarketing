/**
 * VPS API Server — Replaces all Supabase Edge Functions
 * Deploy on agenciapulse.tech alongside the existing upload-server
 * 
 * SETUP:
 * 1. npm install express cors @supabase/supabase-js pg bcrypt jsonwebtoken
 * 2. Create .env with all required variables (see bottom of file)
 * 3. pm2 start server.mjs --name pulse-api
 * 
 * Runs on port 3002 (upload-server uses 3001)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const app = express();
const PORT = process.env.API_PORT || 3002;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── PostgreSQL local ───────────────────────────────────────
const pgPassword = process.env.PG_PASSWORD ?? process.env.DB_PASSWORD;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'pulse_db',
  user: process.env.PG_USER || process.env.DB_USER || 'pulse_user',
  ...(typeof pgPassword === 'string' && pgPassword.length > 0 ? { password: pgPassword } : {}),
});

// ─── JWT Config ─────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES_IN = '7d';

// ─── Supabase clients (transitional — will be removed later) ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function getUserClient(authHeader) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
}

// ─── Auth helpers (JWT-based) ───────────────────────────────
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function verifyUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');
  const token = authHeader.replace('Bearer ', '');

  try {
    // Try JWT first (new system)
    const decoded = verifyToken(token);
    return {
      user: { id: decoded.sub, email: decoded.email, role: decoded.role },
      userClient: getUserClient(authHeader),
    };
  } catch {
    // Fallback to Supabase Auth (transitional)
    const userClient = getUserClient(authHeader);
    if (!userClient) throw new Error('Unauthorized');
    const { data, error } = await userClient.auth.getUser(token);
    if (error || !data?.user) throw new Error('Unauthorized');
    return { user: data.user, userClient };
  }
}

async function verifyAdmin(req) {
  const { user, userClient } = await verifyUser(req);
  // Check role from JWT payload first
  if (user.role === 'admin') {
    return { user, userClient, admin: getAdminClient() };
  }
  // Fallback: check DB
  const { rows } = await pool.query(
    'SELECT role FROM user_roles WHERE user_id = $1 AND role = $2',
    [user.id, 'admin']
  );
  if (rows.length === 0) throw new Error('Admin access required');
  return { user, userClient, admin: getAdminClient() };
}

// ═══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Login ──────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    // Find profile by email
    const { rows: profiles } = await pool.query(
      'SELECT id, name, email, role, avatar_url, display_name, job_title, password_hash FROM profiles WHERE email = $1 LIMIT 1',
      [email.toLowerCase().trim()]
    );
    if (profiles.length === 0) return res.status(401).json({ error: 'Email ou senha inválidos' });

    const profile = profiles[0];
    if (!profile.password_hash) return res.status(401).json({ error: 'Senha não configurada. Solicite ao administrador.' });

    const valid = await bcrypt.compare(password, profile.password_hash);
    if (!valid) return res.status(401).json({ error: 'Email ou senha inválidos' });

    // Get role from user_roles table
    const { rows: roles } = await pool.query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [profile.id]
    );
    const role = roles[0]?.role || profile.role || 'editor';

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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// ─── Get current user ───────────────────────────────────────
app.get('/api/auth/me', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { rows } = await pool.query(
      'SELECT p.id, p.name, p.email, p.avatar_url, p.display_name, p.job_title, p.bio, p.birthday, ur.role FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id WHERE p.id = $1 LIMIT 1',
      [user.id]
    );
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
    });
  } catch (error) {
    res.status(401).json({ error: 'Não autenticado' });
  }
});

// ─── Change password ────────────────────────────────────────
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { user } = await verifyUser(req);
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });

    const { rows } = await pool.query('SELECT password_hash FROM profiles WHERE id = $1', [user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Perfil não encontrado' });

    // If user already has a password, verify current one
    if (rows[0].password_hash && currentPassword) {
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);

    res.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Set password for a team member ──────────────────
app.post('/api/auth/set-password', async (req, res) => {
  try {
    const { user } = await verifyAdmin(req);
    const { userId, password } = req.body;
    if (!userId || !password || password.length < 6) return res.status(400).json({ error: 'userId e senha (min 6 chars) obrigatórios' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);

    res.json({ success: true, message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Admin: Create user ─────────────────────────────────────
app.post('/api/auth/create-user', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const { rows: existing } = await pool.query('SELECT id FROM profiles WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email já cadastrado no sistema' });

    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 12);
    const userRole = role || 'editor';

    await pool.query(
      `INSERT INTO profiles (id, name, email, role, password_hash) VALUES ($1, $2, $3, $4, $5)`,
      [id, name, email.toLowerCase().trim(), userRole, hash]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [id, userRole]
    );

    res.json({ success: true, user: { id, name, email: email.toLowerCase().trim(), role: userRole } });
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

    const hash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);

    res.json({ success: true, message: 'Senha redefinida com sucesso' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message });
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

async function fetchDbApiKey(supabase, aiProvider) {
  if (!aiProvider) return undefined;
  const providerMap = { gemini: 'ai_gemini', openai: 'ai_openai', claude: 'ai_claude' };
  const { data } = await supabase
    .from('api_integrations').select('config')
    .eq('provider', providerMap[aiProvider] || '').eq('status', 'ativo').limit(1).single();
  return data?.config?.api_key_encrypted;
}

async function callAi(ai, model, messages, options = {}) {
  const { temperature = 0.3, max_tokens = 2000 } = options;
  if (ai.provider === 'claude') {
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');
    const res = await fetch(ai.url, {
      method: 'POST',
      headers: { 'x-api-key': ai.key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens, ...(systemMsg ? { system: systemMsg.content } : {}), messages: otherMsgs }),
    });
    if (!res.ok) throw new Error(`Claude error [${res.status}]: ${await res.text()}`);
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }
  const res = await fetch(ai.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ai.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!res.ok) throw new Error(`AI error [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// WhatsApp helper
const WHATSAPP_API_URL = 'https://api.atendeclique.com.br/api/messages/send';
const PORTAL_BASE_URL = 'https://pulsegrowthmarketing.lovable.app/portal';

async function sendWhatsAppDirect(config, number, message, supabase, clientId, triggerType) {
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
    await supabase.from('whatsapp_messages').insert({
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

    const selectedModel = aiModel || 'gemini-2.5-flash-lite';
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
      endoContractsRes, endoClientesRes, endoPartnerTasksRes, endoPackagesRes, onboardingTasksRes
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
      pool.query(`SELECT sd.*, c.company_name AS client_name FROM social_media_deliveries sd LEFT JOIN clients c ON c.id = sd.client_id WHERE sd.delivery_date >= $1 ORDER BY sd.delivery_date DESC LIMIT 300`, [startOfMonth]).catch(() => ({ rows: [] })),
      pool.query(`SELECT id, name, email, role, job_title FROM profiles`),
      pool.query(`SELECT * FROM plans`),
      pool.query(`SELECT * FROM goals WHERE status != 'cancelada' ORDER BY end_date DESC LIMIT 20`).catch(() => ({ rows: [] })),
      pool.query(`SELECT cpc.*, c.company_name AS client_name FROM client_portal_contents cpc LEFT JOIN clients c ON c.id = cpc.client_id ORDER BY cpc.created_at DESC LIMIT 100`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ec.*, c.company_name AS client_name, ep.package_name, ep.category AS package_category, ep.sessions_per_week, ep.duration_hours, ep.stories_per_day, pf.name AS partner_name FROM client_endomarketing_contracts ec LEFT JOIN clients c ON c.id = ec.client_id LEFT JOIN endomarketing_packages ep ON ep.id = ec.package_id LEFT JOIN profiles pf ON pf.id = ec.partner_id ORDER BY ec.created_at DESC`).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM endomarketing_clientes ORDER BY company_name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ept.*, c.company_name AS client_name, pf.name AS partner_name FROM endomarketing_partner_tasks ept LEFT JOIN clients c ON c.id = ept.client_id LEFT JOIN profiles pf ON pf.id = ept.partner_id WHERE ept.date >= $1 ORDER BY ept.date DESC LIMIT 300`, [SYSTEM_START]).catch(() => ({ rows: [] })),
      pool.query(`SELECT * FROM endomarketing_packages ORDER BY category, package_name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT ot.*, c.company_name AS client_name FROM onboarding_tasks ot LEFT JOIN clients c ON c.id = ot.client_id ORDER BY ot.created_at DESC LIMIT 100`).catch(() => ({ rows: [] })),
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
${socialDeliveries.slice(0, 40).map(sd => `- ${fmtDate(sd.delivery_date)} | ${sd.client_name} | Tipo: ${sd.delivery_type || 'N/A'} | Plataforma: ${sd.platform || 'N/A'}`).join('\n')}

### 🌐 CONTEÚDOS DO PORTAL (${portalContents.length})
${portalContents.slice(0, 20).map(pc => `- ${pc.client_name}: "${pc.title}" | Tipo: ${pc.content_type} | Status: ${pc.status} | Temporada: ${pc.season_month}/${pc.season_year}`).join('\n')}

### 🏆 METAS
${goals.map(g => `- ${g.title}: ${g.current_value}/${g.target_value} (${g.status}) | Período: ${fmtDate(g.start_date)} a ${fmtDate(g.end_date)}`).join('\n') || 'Nenhuma meta cadastrada'}`;

    const systemPrompt = `Você é o Foguetinho 🚀, o assistente inteligente da Agência Pulse de Marketing Digital. Você tem acesso a TODOS os dados do sistema: financeiro, clientes, contratos, gravações, roteiros, tarefas de conteúdo, design, entregas, postagens, metas e equipe.

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
    const selectedModel = aiModel || 'gemini-2.5-flash-lite';
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
    const model = aiModel || 'gemini-2.5-flash-lite';

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
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'pulse_portal_salt_2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

app.post('/api/client-portal-auth', async (req, res) => {
  try {
    const { action, login, password, client_id, slug } = req.body;

    if (action === 'login') {
      if (!login || !password) return res.status(400).json({ error: 'Login e senha obrigatórios' });
      const { rows: [client] } = await pool.query(
        `SELECT id, company_name, client_login, client_password_hash, color, logo_url FROM clients WHERE client_login = $1`,
        [login.trim()]
      );
      if (!client) return res.status(404).json({ error: 'Login não encontrado' });
      const passwordHash = await hashPassword(password);
      if (client.client_password_hash !== passwordHash) return res.status(401).json({ error: 'Senha incorreta' });
      return res.json({ success: true, client_id: client.id, company_name: client.company_name, color: client.color, logo_url: client.logo_url });
    }

    if (action === 'register') {
      if (!client_id || !login || !password) return res.status(400).json({ error: 'Dados incompletos' });
      const { rows: [existing] } = await pool.query(
        `SELECT client_login, client_password_hash FROM clients WHERE id = $1`, [client_id]
      );
      if (!existing) return res.status(404).json({ error: 'Cliente não encontrado' });
      if (existing.client_login && existing.client_password_hash) return res.status(409).json({ error: 'Conta já existe' });
      const { rows: taken } = await pool.query(
        `SELECT id FROM clients WHERE client_login = $1 AND id != $2`, [login.trim(), client_id]
      );
      if (taken.length > 0) return res.status(409).json({ error: 'Login já em uso' });
      const passwordHash = await hashPassword(password);
      await pool.query(
        `UPDATE clients SET client_login = $1, client_password_hash = $2 WHERE id = $3`,
        [login.trim(), passwordHash, client_id]
      );
      const { rows: [clientData] } = await pool.query(`SELECT company_name FROM clients WHERE id = $1`, [client_id]);
      return res.json({ success: true, client_id, company_name: clientData?.company_name });
    }

    if (action === 'get_info') {
      if (!client_id && !slug) return res.status(400).json({ error: 'client_id or slug required' });
      let query, params;
      if (client_id) {
        query = `SELECT id, company_name, color, logo_url, client_login, client_password_hash, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city FROM clients WHERE id = $1`;
        params = [client_id];
      } else {
        query = `
          SELECT id, company_name, color, logo_url, client_login, client_password_hash, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city
          FROM clients
          WHERE trim(both '-' from regexp_replace(lower(trim(company_name)), '\\s+', '-', 'g')) = trim(both '-' from regexp_replace(lower(trim($1)), '\\s+', '-', 'g'))
             OR lower(trim(company_name)) = lower(trim(replace($1, '-', ' ')))
          LIMIT 1
        `;
        params = [slug];
      }
      const { rows: [data] } = await pool.query(query, params);
      if (!data) return res.status(404).json({ error: 'Cliente não encontrado' });
      return res.json({ id: data.id, company_name: data.company_name, color: data.color, logo_url: data.logo_url, has_credentials: !!(data.client_login && data.client_password_hash), weekly_reels: data.weekly_reels, weekly_creatives: data.weekly_creatives, weekly_stories: data.weekly_stories, monthly_recordings: data.monthly_recordings, plan_id: data.plan_id, show_metrics: data.show_metrics, has_vehicle_flyer: data.has_vehicle_flyer, niche: data.niche, whatsapp: data.whatsapp, city: data.city });
    }

    if (action === 'get_contents') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { rows } = await pool.query(
        `SELECT * FROM client_portal_contents WHERE client_id = $1 ORDER BY created_at DESC`, [client_id]
      );
      return res.json({ contents: rows || [] });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Portal auth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 5b. Portal Actions (no JWT required — client-facing) ───
app.post('/api/portal-actions', async (req, res) => {
  try {
    const { action, client_id, content_id, author_name, author_type, author_id, message } = req.body;

    // ── Get client info ──
    if (action === 'get_client') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client_id);
      let query, params;
      if (isUUID) {
        query = 'SELECT id, company_name, logo_url, color, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city FROM clients WHERE id = $1 LIMIT 1';
        params = [client_id];
      } else {
        query = `SELECT id, company_name, logo_url, color, weekly_reels, weekly_creatives, weekly_stories, monthly_recordings, plan_id, show_metrics, has_vehicle_flyer, niche, whatsapp, city FROM clients WHERE trim(both '-' from regexp_replace(lower(trim(company_name)), '\\s+', '-', 'g')) = trim(both '-' from regexp_replace(lower(trim($1)), '\\s+', '-', 'g')) LIMIT 1`;
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
        `SELECT id, title, content, caption, content_format, video_type, created_at, created_by, priority, client_priority 
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

    res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Portal actions error:', err);
    res.status(500).json({ error: err.message });
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

// ─── 7. Portal Media Proxy ──────────────────────────────────
app.all('/api/portal-media-proxy', async (req, res) => {
  try {
    const targetUrl = req.method === 'GET' ? req.query.url : req.body?.url;
    if (!targetUrl) return res.status(400).json({ error: 'url is required' });
    try { const parsed = new URL(targetUrl); if (parsed.origin !== 'https://agenciapulse.tech' || !parsed.pathname.startsWith('/uploads/')) return res.status(400).json({ error: 'URL not allowed' }); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers.accept) headers.Accept = req.headers.accept;
    const upstream = await fetch(targetUrl, { headers, redirect: 'follow' });
    if (!upstream.ok && upstream.status !== 206) return res.status(upstream.status).json({ error: 'Failed to fetch media' });

    const passthroughHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'];
    for (const h of passthroughHeaders) { const v = upstream.headers.get(h); if (v) res.setHeader(h, v); }
    if (!upstream.headers.get('content-type')) {
      if (/\.mp4(\?|$)/i.test(targetUrl)) res.setHeader('content-type', 'video/mp4');
      else res.setHeader('content-type', 'application/octet-stream');
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Disposition', 'inline');
    
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buffer);
  } catch (error) {
    console.error('portal-media-proxy error:', error);
    res.status(500).json({ error: error.message });
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
    const { error } = await admin.auth.admin.updateUser(userId, { password: newPassword });
    if (error) return res.status(400).json({ error: error.message });
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
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
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
  'recording_wait_logs','portal_videos','portal_video_views',
];

function sanitizeIdentifier(name) {
  // Only allow alphanumeric and underscores
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

// Generic query endpoint
app.post('/api/db/query', async (req, res) => {
  try {
    await verifyUser(req);
    const { table, operation, data, filters, select, order, limit: queryLimit, single, joins } = req.body;

    const safeTable = sanitizeIdentifier(table);
    if (!ALLOWED_TABLES.includes(safeTable)) {
      return res.status(403).json({ error: `Table "${safeTable}" is not allowed` });
    }

    let result;

    switch (operation) {
      case 'select': {
        let query = `SELECT ${select || '*'} FROM ${safeTable}`;
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
            }
          }
          if (whereClauses.length > 0) query += ` WHERE ${whereClauses.join(' AND ')}`;
        }

        // Handle order
        if (order) {
          const orderParts = Array.isArray(order) ? order : [order];
          const orderClauses = orderParts.map(o => `${sanitizeIdentifier(o.column)} ${o.ascending === false ? 'DESC' : 'ASC'}`);
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
        for (const item of items) {
          const keys = Object.keys(item).map(sanitizeIdentifier);
          const values = Object.values(item).map(v => typeof v === 'object' && v !== null && !Array.isArray(v) ? JSON.stringify(v) : v);
          const placeholders = values.map((_, i) => `$${i + 1}`);
          const { rows } = await pool.query(
            `INSERT INTO ${safeTable} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
            values
          );
          allResults.push(rows[0]);
        }
        result = { data: allResults.length === 1 ? allResults[0] : allResults, error: null };
        break;
      }

      case 'update': {
        const keys = Object.keys(data).map(sanitizeIdentifier);
        const values = Object.values(data).map(v => typeof v === 'object' && v !== null && !Array.isArray(v) ? JSON.stringify(v) : v);
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
        query += ' RETURNING *';
        const { rows } = await pool.query(query, params);
        result = { data: rows, error: null };
        break;
      }

      case 'delete': {
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
    res.status(500).json({ data: null, error: { message: e.message } });
  }
});

// ═══════════════════════════════════════════════════════════════
// CRUD ROUTES — Phase 4: Direct DB access (replaces Supabase SDK)
// ═══════════════════════════════════════════════════════════════

// ─── Clients ────────────────────────────────────────────────
app.get('/api/clients', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM clients ORDER BY company_name');
    res.json(rows);
  } catch (e) { res.status(e.message === 'Unauthorized' ? 401 : 500).json({ error: e.message }); }
});

app.post('/api/clients', async (req, res) => {
  try {
    await verifyUser(req);
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
        c.whatsapp || '', c.whatsapp_group || null, c.email || '', c.city || '',
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
  } catch (e) { console.error('POST /api/clients error:', e); res.status(500).json({ error: e.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    await verifyUser(req);
    const { id } = req.params;
    const c = req.body;
    // Build dynamic SET clause from provided fields
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
        sets.push(`${key} = $${idx}`);
        vals.push(key === 'briefing_data' ? JSON.stringify(c[key]) : c[key]);
        idx++;
      }
    }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const { rows } = await pool.query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { console.error('PUT /api/clients error:', e); res.status(500).json({ error: e.message }); }
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
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM recordings ORDER BY date DESC');
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/recordings', async (req, res) => {
  try {
    await verifyUser(req);
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const r of items) {
      const { rows } = await pool.query(
        `INSERT INTO recordings (id, client_id, videomaker_id, date, start_time, type, status, confirmation_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [r.id || crypto.randomUUID(), r.client_id, r.videomaker_id, r.date, r.start_time, r.type || 'fixa', r.status || 'agendada', r.confirmation_status || 'pendente']
      );
      results.push(rows[0]);
    }
    res.json(results.length === 1 ? results[0] : results);
  } catch (e) { console.error('POST /api/recordings error:', e); res.status(500).json({ error: e.message }); }
});

app.put('/api/recordings/:id', async (req, res) => {
  try {
    await verifyUser(req);
    const { id } = req.params;
    const r = req.body;
    const allowed = ['client_id','videomaker_id','date','start_time','type','status','confirmation_status'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) { if (r[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(r[key]); idx++; } }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    vals.push(id);
    const { rows } = await pool.query(`UPDATE recordings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recordings/:id', async (req, res) => {
  try {
    await verifyUser(req);
    const id = req.params.id;
    // Cascade: remove dependent records first
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [id]);
    await pool.query('DELETE FROM delivery_records WHERE recording_id = $1', [id]);
    await pool.query('DELETE FROM recording_wait_logs WHERE recording_id = $1', [id]);
    await pool.query('DELETE FROM recordings WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk delete future recordings for a client
app.delete('/api/recordings/future/:clientId', async (req, res) => {
  try {
    await verifyUser(req);
    const today = new Date().toISOString().split('T')[0];
    const { rowCount } = await pool.query(
      "DELETE FROM recordings WHERE client_id = $1 AND status = 'agendada' AND date >= $2",
      [req.params.clientId, today]
    );
    res.json({ deleted: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Kanban Tasks ───────────────────────────────────────────
app.get('/api/kanban-tasks', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM kanban_tasks ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/kanban-tasks', async (req, res) => {
  try {
    await verifyUser(req);
    const t = req.body;
    const { rows } = await pool.query(
      `INSERT INTO kanban_tasks (id, client_id, title, "column", checklist, week_start, recording_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.id || crypto.randomUUID(), t.client_id, t.title, t.column || 'todo', JSON.stringify(t.checklist || []), t.week_start, t.recording_date || null]
    );
    res.json(rows[0]);
  } catch (e) { console.error('POST /api/kanban-tasks error:', e); res.status(500).json({ error: e.message }); }
});

app.put('/api/kanban-tasks/:id', async (req, res) => {
  try {
    await verifyUser(req);
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
    const { rows } = await pool.query(`UPDATE kanban_tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/kanban-tasks/:id', async (req, res) => {
  try {
    await verifyUser(req);
    await pool.query('DELETE FROM kanban_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Scripts ────────────────────────────────────────────────
app.get('/api/scripts', async (req, res) => {
  try {
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM scripts ORDER BY created_at DESC');
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/scripts', async (req, res) => {
  try {
    await verifyUser(req);
    const s = req.body;
    const { rows } = await pool.query(
      `INSERT INTO scripts (id, client_id, title, video_type, content_format, content, recorded, priority, is_endomarketing, endo_client_id, scheduled_date, created_by, caption, client_priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [s.id || crypto.randomUUID(), s.client_id, s.title, s.video_type || 'reels', s.content_format || 'reels',
       s.content || '', s.recorded ?? false, s.priority || 'normal', s.is_endomarketing ?? false,
       s.endo_client_id || null, s.scheduled_date || null, s.created_by || null, s.caption || null, s.client_priority || 'normal']
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
    await verifyUser(req);
    const { id } = req.params;
    const s = req.body;
    const allowed = ['client_id','title','video_type','content_format','content','recorded','priority','is_endomarketing','endo_client_id','scheduled_date','created_by','caption','client_priority'];
    const sets = []; const vals = []; let idx = 1;
    for (const key of allowed) { if (s[key] !== undefined) { sets.push(`${key} = $${idx}`); vals.push(s[key]); idx++; } }
    if (sets.length === 0) return res.json({ message: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    vals.push(id);
    const { rows } = await pool.query(`UPDATE scripts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/scripts/:id', async (req, res) => {
  try {
    await verifyUser(req);
    await pool.query('DELETE FROM scripts WHERE id = $1', [req.params.id]);
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
    await verifyUser(req);
    const { rows } = await pool.query('SELECT * FROM active_recordings');
    res.json(rows);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.post('/api/active-recordings', async (req, res) => {
  try {
    await verifyUser(req);
    const r = req.body;
    // Remove existing for this recording
    await pool.query('DELETE FROM active_recordings WHERE recording_id = $1', [r.recording_id]);
    const { rows } = await pool.query(
      `INSERT INTO active_recordings (recording_id, videomaker_id, client_id, started_at, planned_script_ids)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [r.recording_id, r.videomaker_id, r.client_id, r.started_at || new Date().toISOString(), r.planned_script_ids || '{}']
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

    const selectedModel = aiModel || 'gemini-2.5-flash-lite';
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
    console.error('Production assistant error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Pulse API Server running on port ${PORT}`);
});

/*
 * .env required variables:
 * 
 * SUPABASE_URL=https://zqpplhbzhetabjopdzcn.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
 * SUPABASE_ANON_KEY=<your_anon_key>
 * GOOGLE_GEMINI_API_KEY=<your_gemini_key>
 * WHATSAPP_API_TOKEN=<your_whatsapp_token>
 * API_PORT=3002
 * 
 * Optional:
 * OPENAI_API_KEY=<if using OpenAI>
 * ANTHROPIC_API_KEY=<if using Claude>
 */

// Teste de ponta a ponta do Pulse Plus (pulsePlus.mjs): acesso às configurações e informações dos agentes.
// Regra do dono: a equipe vê o agente como qualquer membro (nome no card, histórico, comentários, equipe, TV),
// mas sem nada que o marque como agente e sem as telas e rotas de configuração dos agentes e do PULSE.
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_plus node tests/pulse-plus.e2e.mjs
// O banco precisa ter o esquema da produção (ex.: CREATE DATABASE pulse_plus TEMPLATE pulse_db).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:teste@localhost:55432/pulse_plus';
const PORT = Number(process.env.TEST_API_PORT || 5071);
const SECRET = 'segredo-teste-pulse-plus';
const BASE = `http://127.0.0.1:${PORT}/api`;
const pool = new pg.Pool({ connectionString: DB });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-plus-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);

const ids = {
  plus: '00000000-0000-0000-0000-00000000b701',   // admin com Pulse Plus (vem da lista dos Agendamentos)
  admin: '00000000-0000-0000-0000-00000000b702',  // admin sem Pulse Plus
  editor: '00000000-0000-0000-0000-00000000b703', // editor da equipe
  agent: '00000000-0000-0000-0000-00000000b704',  // agente (perfil + chave ativa)
  thiago: '00000000-0000-0000-0000-00000000b705', // admin "Thiago" (semente sem lista dos Agendamentos)
  client: '00000000-0000-0000-0000-00000000b711',
  taskWork: '00000000-0000-0000-0000-00000000b721', // agente editando agora
  taskReview: '00000000-0000-0000-0000-00000000b722', // Análise com parecer do agente
  taskFree: '00000000-0000-0000-0000-00000000b723',
  design: '00000000-0000-0000-0000-00000000b731',
  waPulse: '00000000-0000-0000-0000-00000000b741', waMixed: '00000000-0000-0000-0000-00000000b742',
  notif: '00000000-0000-0000-0000-00000000b751', waMsg: '00000000-0000-0000-0000-00000000b752',
  taskPulse: '00000000-0000-0000-0000-00000000b724', // card pedido pelo PULSE (texto antigo, com robô)
  fin: '00000000-0000-0000-0000-00000000b761', // lançamento do financeiro feito pelo PULSE (texto antigo)
};
const PEOPLE = [ids.plus, ids.admin, ids.editor, ids.agent, ids.thiago];
const TASKS = [ids.taskWork, ids.taskReview, ids.taskFree, ids.taskPulse];
const AGENT_AVATAR = `https://agenciapulse.tech/uploads/avatars/agentes/${ids.agent}/foto.png`;
const AGENT_KEY = `pa_teste_pulse_plus_${crypto.randomBytes(6).toString('hex')}`;
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function waitFor(fn, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`tempo esgotado: ${label}`);
    await sleep(300);
  }
}

async function cleanup() {
  await pool.query(`DELETE FROM task_history WHERE task_id = ANY($1)`, [TASKS]).catch(() => {});
  await pool.query(`DELETE FROM design_task_history WHERE task_id = $1`, [ids.design]).catch(() => {});
  await pool.query(`DELETE FROM content_tasks WHERE id = ANY($1)`, [TASKS]).catch(() => {});
  await pool.query(`DELETE FROM design_tasks WHERE id = $1`, [ids.design]).catch(() => {});
  await pool.query(`DELETE FROM notifications WHERE id = $1`, [ids.notif]).catch(() => {});
  await pool.query(`DELETE FROM whatsapp_messages WHERE id = $1`, [ids.waMsg]).catch(() => {});
  await pool.query(`DELETE FROM financial_activity_log WHERE entity_id = $1`, [ids.fin]).catch(() => {});
  await pool.query(`DELETE FROM wa_connections WHERE id = ANY($1)`, [[ids.waPulse, ids.waMixed]]).catch(() => {});
  await pool.query(`DELETE FROM agent_keys WHERE user_id = $1`, [ids.agent]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE id = $1`, [ids.client]).catch(() => {});
  await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM user_cities WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [PEOPLE]).catch(() => {});
  // listas de acesso do teste: o servidor semeia de novo na subida
  await pool.query(`DELETE FROM module_access WHERE module IN ('pulse_plus', 'agendamentos')`).catch(() => {});
}

async function people() {
  await pool.query(
    `INSERT INTO profiles (id, name, email, role) VALUES
       ($1, 'Paula Plus', 'paula.plus@teste.local', 'admin'),
       ($2, 'Carlos Admin', 'carlos.plus@teste.local', 'admin'),
       ($3, 'Edson Editor', 'edson.plus@teste.local', 'editor'),
       ($4, 'Bia Agente Teste', 'bia.plus@teste.local', 'editor')`,
    [ids.plus, ids.admin, ids.editor, ids.agent]
  );
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin'), ($2, 'admin'), ($3, 'editor'), ($4, 'editor')`,
    [ids.plus, ids.admin, ids.editor, ids.agent]);
}

async function fixtures() {
  await pool.query(`INSERT INTO clients (id, company_name, city, status, color) VALUES ($1, 'Cliente Plus', 'minacu', 'ativo', '200 80% 45%')`, [ids.client]);
  await pool.query(
    `INSERT INTO agent_keys (user_id, role, key_hash, key_hint) VALUES ($1, 'editor', $2, $3)`,
    [ids.agent, sha256(AGENT_KEY), AGENT_KEY.slice(-4)]
  );
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, assigned_to, drive_link, agent_step, agent_heartbeat_at, city)
     VALUES ($1, $3, 'Vídeo com agente', 'reels', 'edicao', $2, 'https://drive.google.com/drive/folders/x', 'cortando', now(), 'minacu')`,
    [ids.taskWork, ids.agent, ids.client]
  );
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_by, agent_review_verdict, agent_review_notes, agent_review_by, agent_review_at, city)
     VALUES ($1, $3, 'Vídeo na Análise', 'reels', 'pre_revisao', $2, 'ajustes', 'Cortar o começo', $2, now(), 'minacu')`,
    [ids.taskReview, ids.agent, ids.client]
  );
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, city) VALUES ($1, $2, 'Vídeo livre', 'reels', 'edicao', 'minacu')`,
    [ids.taskFree, ids.client]
  );
  await pool.query(
    `INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, 'Edição iniciada', NULL), ($3, $2, 'Parecer da Análise', '⚠ ajustes: Cortar o começo')`,
    [ids.taskWork, ids.agent, ids.taskReview]
  );
  await pool.query(
    `INSERT INTO design_tasks (id, client_id, title, format_type, kanban_column, assigned_to, agent_step, agent_heartbeat_at, observations, city)
     VALUES ($1, $2, 'Arte com agente', 'feed', 'executando', $3, 'montando', now(), '🤖 Análise IA (v1): trocar a cor', 'minacu')`,
    [ids.design, ids.client, ids.agent]
  );
  await pool.query(
    `INSERT INTO design_task_history (task_id, user_id, action, details) VALUES
       ($1, $2, 'Arte iniciada (agente)', NULL),
       ($1, $2, 'Arte entregue pelo agente (v1) → Pré-análise', '1 arquivo(s)')`,
    [ids.design, ids.agent]
  );
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, message, type, link) VALUES ($1, $2, '📊 Relatório pronto', 'Relatório pronto. Observação do agente: tudo certo', 'assistente', '/configuracoes')`,
    [ids.notif, ids.admin]
  );
  await pool.query(
    `INSERT INTO whatsapp_messages (id, phone_number, message, status, trigger_type, client_id) VALUES ($1, '5562999990000', 'Olá! Segue o relatório.', 'enviada', 'assistente', $2)`,
    [ids.waMsg, ids.client]
  );
  await pool.query(
    `INSERT INTO wa_connections (id, name, purposes) VALUES ($1, 'PULSE', ARRAY['assistente']), ($2, 'Aprovações', ARRAY['aprovacao', 'assistente'])`,
    [ids.waPulse, ids.waMixed]
  );
  // textos que o PULSE gravava antes (cards e financeiro): ficam no banco como estão
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, description, city)
     VALUES ($1, $2, 'Reels pedido', 'reels', 'ideias', $3, 'minacu')`,
    [ids.taskPulse, ids.client, '🤖 Pedido pelo PULSE (WhatsApp) — Thiago\n\nReels de clareamento']
  );
  await pool.query(`INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, '🤖 Card criado pelo PULSE (WhatsApp)', 'Pedido por Thiago')`,
    [ids.taskPulse, ids.plus]);
  await pool.query(`UPDATE design_tasks SET description = $2 WHERE id = $1`, [ids.design, '🤖 Pedido pelo PULSE (WhatsApp) — Thiago\n\nArte da promoção']);
  await pool.query(
    `INSERT INTO financial_activity_log (user_id, action_type, entity_type, entity_id, description, details, city)
     VALUES ($1, 'criação', 'despesa', $2, 'Registrou despesa - R$ 50,00 - Almoço (PULSE, Thiago)', $3, 'minacu')`,
    [ids.plus, ids.fin, JSON.stringify({ valor: 50, descricao: 'Almoço', origem: 'assistente_pulse', numero: 'Thiago' })]
  );
  // foto de agente trocada pelo Painel antes de 26/10/2026 (pasta com "agentes" no endereço)
  await pool.query(`UPDATE profiles SET avatar_url = $2 WHERE id = $1`, [ids.agent, AGENT_AVATAR]);
  const avatarDir = path.join(TMP, 'uploads', 'avatars', 'agentes', ids.agent);
  fs.mkdirSync(avatarDir, { recursive: true });
  fs.writeFileSync(path.join(avatarDir, 'foto.png'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
}

function startServer() {
  const child = spawn('node', [path.join(API_DIR, 'server.mjs')], {
    cwd: API_DIR,
    env: {
      ...process.env, DATABASE_URL: DB, JWT_SECRET: SECRET, API_PORT: String(PORT),
      ANTHROPIC_API_KEY: '', GOOGLE_GEMINI_API_KEY: '', OPENAI_API_KEY: '', ASSISTANT_DISABLED: '1',
      UPLOAD_ROOT: path.join(TMP, 'uploads'), PUBLIC_UPLOADS_URL: 'https://agenciapulse.tech/uploads',
      WA_PRIVATE_DIR: path.join(TMP, 'wa'), AGENT_PRIVATE_DIR: path.join(TMP, 'agent'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, log: '' };
  child.stdout.on('data', (d) => { state.log += d; });
  child.stderr.on('data', (d) => { state.log += d; });
  return state;
}

async function waitHealthy(state) {
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch {}
  }
  throw new Error(`servidor não subiu:\n${state.log.slice(-3000)}`);
}

async function stopServer(state) {
  if (!state?.child || state.child.exitCode !== null) return;
  state.child.kill();
  await new Promise((r) => state.child.once('exit', r));
}

// ── Fase 1: semente a partir da lista dos Agendamentos ─────────
// banco novo: a tabela é a mesma que o servidor cria (scheduling.mjs / pulsePlus.mjs)
await pool.query(`
  CREATE TABLE IF NOT EXISTS module_access (
    module TEXT NOT NULL, user_id UUID NOT NULL, created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (module, user_id)
  )`);
await cleanup();
await people();
await pool.query(`INSERT INTO module_access (module, user_id, created_by) VALUES ('agendamentos', $1, 'teste')`, [ids.plus]);
let server = startServer();
process.on('exit', () => { try { server.child.kill(); } catch {} });
await waitHealthy(server);
await waitFor(async () => server.log.includes('[pulse-plus]'), 'semente do Pulse Plus');
await fixtures();

const token = (id, email, role) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '1h' });
const T = {
  plus: token(ids.plus, 'paula.plus@teste.local', 'admin'),
  admin: token(ids.admin, 'carlos.plus@teste.local', 'admin'),
  editor: token(ids.editor, 'edson.plus@teste.local', 'editor'),
};
const api = async (method, url, body, { auth = T.plus, city = 'minacu', headers = {} } = {}) => {
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth.startsWith('pa_') ? `Agent ${auth}` : `Bearer ${auth}` } : {}), 'x-pulse-city': city, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const dbq = (auth, body) => api('POST', '/db/query', body, { auth });
const row = async (sql, params) => (await pool.query(sql, params)).rows[0];

try {
  // ── Semente ──
  assert.match(server.log, /\[pulse-plus\] acesso semeado \(quem estava nos Agendamentos\) com: Paula Plus/);
  let list = (await pool.query(`SELECT user_id FROM module_access WHERE module = 'pulse_plus'`)).rows.map((r) => r.user_id);
  assert.deepEqual(list, [ids.plus], 'só quem estava nos Agendamentos');
  assert.ok(await row(`SELECT 1 FROM module_access_log WHERE module = 'pulse_plus' AND user_id = $1 AND actor_name = 'semente'`, [ids.plus]));
  ok('semente: a lista dos Agendamentos virou a lista do Pulse Plus (e o log diz quem)');

  let r = await api('GET', '/me/module-access');
  assert.ok(r.json.modules.includes('pulse_plus'));
  for (const who of ['admin', 'editor']) {
    r = await api('GET', '/me/module-access', null, { auth: T[who] });
    assert.equal(r.status, 200);
    assert.ok(!r.json.modules.includes('pulse_plus'), `${who} sem Pulse Plus`);
  }
  ok('/api/me/module-access devolve pulse_plus só para quem tem');

  // ── Rotas de configuração e informação dos agentes ──
  const guarded = [
    ['GET', '/agents/office'], ['GET', '/agents/overview'], ['GET', '/agents/design-overview'],
    ['POST', '/agents/pause', { scope: 'all' }], ['POST', '/agents/resume', { scope: 'all' }],
    ['GET', '/agent-keys'], ['POST', '/agent-keys', { user_id: ids.editor, role: 'editor' }],
    ['GET', '/agent-machines'], ['GET', '/design-agents'], ['GET', `/design-tasks/${ids.design}/agent-reviews`],
    ['GET', '/assistant/overview'], ['PATCH', '/assistant/settings', { enabled: true }],
    ['POST', '/assistant/numbers', { name: 'X', phone: '62999998888', cities: ['minacu'] }],
  ];
  for (const who of ['admin', 'editor']) {
    for (const [method, url, body] of guarded) {
      r = await api(method, url, body, { auth: T[who] });
      assert.equal(r.status, 403, `${who} ${method} ${url} → ${r.status}`);
      assert.ok(!JSON.stringify(r.json || {}).includes(ids.agent), 'resposta sem o id do agente');
    }
  }
  r = await fetch(`${BASE}/agents/office`);
  assert.equal(r.status, 401);
  ok(`sem Pulse Plus: ${guarded.length} rotas de agentes e do PULSE respondem 403 (admin e editor); sem login, 401`);

  // O Express encaminha sem diferenciar maiúsculas (e aceita barra no fim): a trava também
  const disguised = [
    ['GET', '/Agents/office'], ['GET', '/AGENTS/OFFICE'], ['GET', '/agents/office/'], ['GET', '/Agents/Overview'],
    ['GET', '/AGENT-KEYS'], ['GET', '/Agent-Machines'], ['GET', '/Design-Agents'], ['GET', `/design-tasks/${ids.design}/Agent-Reviews`],
    ['GET', '/Assistant/overview'], ['GET', '/%61gents/office'], ['GET', '/agents%2Foffice'],
    ['POST', '/Agent-Keys', { user_id: ids.editor, role: 'editor' }], ['PATCH', '/Assistant/settings', { enabled: true }],
    ['POST', '/AGENTS/pause', { scope: 'all' }],
  ];
  for (const who of ['admin', 'editor']) {
    for (const [method, url, body] of disguised) {
      r = await api(method, url, body, { auth: T[who] });
      assert.equal(r.status, 403, `${who} ${method} ${url} → ${r.status}`);
    }
  }
  for (const url of ['/api//agents/office', '//api/agents/office', '/api/agents//office']) {
    const resp = await fetch(`http://127.0.0.1:${PORT}${url}`, { headers: { Authorization: `Bearer ${T.editor}` } });
    assert.ok([403, 404].includes(resp.status), `${url} → ${resp.status}`);
    assert.ok(!JSON.stringify(await resp.json().catch(() => ({}))).includes(ids.agent));
  }
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM agent_keys WHERE user_id = $1`, [ids.editor])).rows[0].n, 0, 'nenhuma chave criada');
  r = await api('GET', '/Agents/office');
  assert.equal(r.status, 200, 'o caminho com outra caixa chega mesmo à rota (com Pulse Plus)');
  ok('a trava não depende de maiúsculas, barra no fim, barra dupla nem caractere codificado');

  r = await api('GET', '/agents/office');
  assert.equal(r.status, 200);
  assert.ok(r.json.agents.some((a) => a.user_id === ids.agent), 'agente na lista de quem tem Pulse Plus');
  for (const url of ['/agents/overview', '/agent-keys', '/agent-machines', '/design-agents', '/assistant/overview', `/design-tasks/${ids.design}/agent-reviews`]) {
    r = await api('GET', url);
    assert.equal(r.status, 200, `Pulse Plus ${url} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  }
  ok('com Pulse Plus: Escritório dos agentes, painel, chaves, máquinas, PULSE e pareceres respondem 200');

  // ── Agendamentos ──
  r = await api('GET', '/scheduling/clients', null, { auth: T.admin });
  assert.equal(r.status, 403);
  r = await api('GET', '/scheduling/clients');
  assert.equal(r.status, 200);
  ok('Agendamentos: 403 sem Pulse Plus (mesmo admin), 200 com');

  // ── /api/db/query: colunas internas ──
  const ctSelect = { table: 'content_tasks', operation: 'select', select: '*', filters: [{ column: 'id', op: 'in', value: TASKS }] };
  for (const who of ['admin', 'editor']) {
    r = await dbq(T[who], ctSelect);
    assert.equal(r.status, 200);
    const work = r.json.data.find((t) => t.id === ids.taskWork);
    const review = r.json.data.find((t) => t.id === ids.taskReview);
    assert.equal(work.assigned_to, ids.agent, 'responsável do card continua visível');
    for (const col of ['agent_step', 'agent_heartbeat_at']) assert.equal(work[col], null, `${who}: ${col} nulo`);
    for (const col of ['agent_review_verdict', 'agent_review_notes', 'agent_review_by', 'agent_review_at']) assert.equal(review[col], null, `${who}: ${col} nulo`);
    assert.equal(review.edited_by, ids.agent);
  }
  r = await dbq(T.plus, ctSelect);
  const plusWork = r.json.data.find((t) => t.id === ids.taskWork);
  assert.equal(plusWork.agent_step, 'cortando');
  assert.ok(plusWork.agent_heartbeat_at);
  assert.equal(r.json.data.find((t) => t.id === ids.taskReview).agent_review_verdict, 'ajustes');
  ok('content_tasks: etapa, sinal de vida e parecer do agente saem nulos sem Pulse Plus; responsável visível para todos');

  r = await dbq(T.admin, { table: 'content_tasks', operation: 'select', select: 'id, agent_step', filters: [{ column: 'id', op: 'eq', value: ids.taskWork }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.data[0].agent_step, null);
  r = await dbq(T.admin, { table: 'content_tasks', operation: 'select', select: 'id, agent_step as etapa', filters: [{ column: 'id', op: 'eq', value: ids.taskWork }] });
  assert.equal(r.status, 403, 'coluna interna com outro nome');
  r = await dbq(T.admin, { table: 'content_tasks', operation: 'select', select: 'id', filters: [{ column: 'agent_step', op: 'is', value: 'not_null' }] });
  assert.equal(r.status, 403, 'filtro por coluna interna');
  r = await dbq(T.admin, { table: 'content_tasks', operation: 'select', select: 'id', filters: [{ op: 'or', value: 'agent_step.eq.cortando,title.eq.x' }] });
  assert.equal(r.status, 403, 'filtro "or" por coluna interna');
  r = await dbq(T.admin, { table: 'content_tasks', operation: 'select', select: 'id', order: { column: 'agent_heartbeat_at', ascending: false }, filters: [{ column: 'id', op: 'in', value: TASKS }] });
  assert.equal(r.status, 403, 'ordenar por coluna interna');
  r = await dbq(T.plus, { table: 'content_tasks', operation: 'select', select: 'id', filters: [{ column: 'agent_step', op: 'eq', value: 'cortando' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.map((t) => t.id), [ids.taskWork]);
  ok('sem Pulse Plus: não dá para filtrar, ordenar nem renomear coluna interna; com Pulse Plus, dá');

  // join: histórico com a coluna interna do card
  const joinBody = {
    table: 'task_history', operation: 'select',
    select: 'task_history.*, content_tasks.agent_step as content_tasks_agent_step',
    joins: [{ table: 'content_tasks', type: 'left', leftTable: 'task_history', leftColumn: 'task_id', rightTable: 'content_tasks', rightColumn: 'id' }],
    filters: [{ column: 'task_id', op: 'eq', value: ids.taskWork }],
  };
  r = await dbq(T.admin, joinBody);
  assert.equal(r.status, 200);
  assert.equal(r.json.data[0].content_tasks_agent_step, null);
  r = await dbq(T.plus, joinBody);
  assert.equal(r.json.data[0].content_tasks_agent_step, 'cortando');
  ok('join com content_tasks também zera a coluna interna');

  r = await dbq(T.admin, { table: 'design_tasks', operation: 'select', select: '*', filters: [{ column: 'id', op: 'eq', value: ids.design }] });
  assert.equal(r.json.data[0].agent_step, null);
  assert.equal(r.json.data[0].agent_heartbeat_at, null);
  assert.equal(r.json.data[0].assigned_to, ids.agent);
  assert.equal(r.json.data[0].observations, 'Pré-análise (v1): trocar a cor', 'observação sem "Análise IA"');
  r = await api('GET', '/design-tasks/fast', null, { auth: T.admin });
  let fast = r.json.find((t) => t.id === ids.design);
  assert.equal(fast.agent_step, null);
  assert.equal(fast.agent_heartbeat_at, null);
  assert.equal(fast.profiles?.name, 'Bia Agente Teste', 'nome do responsável no card');
  r = await api('GET', '/design-tasks/fast');
  fast = r.json.find((t) => t.id === ids.design);
  assert.equal(fast.agent_step, 'montando');
  ok('design_tasks (genérico e feed rápido): etapa e sinal nulos sem Pulse Plus; nome do responsável visível');

  // tabelas dos agentes: nem quem tem Pulse Plus lê pelo genérico (as telas usam as rotas próprias)
  for (const table of ['agent_keys', 'agent_jobs', 'agent_machines', 'design_reviews', 'design_review_errors', 'design_deliveries', 'assistant_settings', 'assistant_numbers', 'module_access']) {
    for (const who of ['admin', 'plus']) {
      r = await dbq(T[who], { table, operation: 'select', select: '*' });
      assert.equal(r.status, 403, `${who} ${table}`);
    }
  }
  ok('tabelas dos agentes, do PULSE e da lista de acesso fechadas no /api/db/query');

  // ── Membros, histórico e avisos: o agente aparece como qualquer membro ──
  r = await dbq(T.editor, { table: 'profiles', operation: 'select', select: 'id, name' });
  assert.ok(r.json.data.some((p) => p.id === ids.agent && p.name === 'Bia Agente Teste'), 'agente na lista da equipe');
  r = await dbq(T.editor, { table: 'user_roles', operation: 'select', select: '*', filters: [{ column: 'user_id', op: 'eq', value: ids.agent }] });
  assert.equal(r.json.data.length, 1);
  r = await dbq(T.editor, { table: 'task_history', operation: 'select', select: '*', filters: [{ column: 'task_id', op: 'in', value: TASKS }] });
  assert.ok(r.json.data.some((h) => h.user_id === ids.agent && h.action === 'Edição iniciada'));
  assert.ok(r.json.data.some((h) => h.user_id === ids.agent && h.action === 'Parecer da Análise' && /Cortar o começo/.test(h.details)));
  r = await dbq(T.editor, { table: 'design_task_history', operation: 'select', select: '*', filters: [{ column: 'task_id', op: 'eq', value: ids.design }] });
  const actions = r.json.data.map((h) => h.action).sort();
  assert.deepEqual(actions, ['Arte entregue (v1) → Pré-análise', 'Arte iniciada']);
  r = await dbq(T.plus, { table: 'design_task_history', operation: 'select', select: '*', filters: [{ column: 'task_id', op: 'eq', value: ids.design }] });
  assert.deepEqual(r.json.data.map((h) => h.action).sort(), ['Arte entregue pelo agente (v1) → Pré-análise', 'Arte iniciada (agente)']);
  r = await dbq(T.admin, { table: 'notifications', operation: 'select', select: '*', filters: [{ column: 'id', op: 'eq', value: ids.notif }] });
  assert.equal(r.json.data[0].message, 'Relatório pronto. Observação: tudo certo');
  r = await dbq(T.admin, { table: 'whatsapp_messages', operation: 'select', select: '*', filters: [{ column: 'id', op: 'eq', value: ids.waMsg }] });
  assert.equal(r.json.data[0].trigger_type, 'manual');
  r = await dbq(T.plus, { table: 'whatsapp_messages', operation: 'select', select: '*', filters: [{ column: 'id', op: 'eq', value: ids.waMsg }] });
  assert.equal(r.json.data[0].trigger_type, 'assistente');
  ok('perfil, funções e histórico do agente visíveis para todos; sem Pulse Plus só some a marca "agente"/"IA" dos textos');

  // ── Coluna interna escrita de outro jeito (ponto no fim, tabela.coluna.x, maiúsculas) e ON do join ──
  const sneaky = [
    { filters: [{ column: 'agent_step.', op: 'is', value: 'not_null' }] },
    { filters: [{ column: 'agent_step.', op: 'like', value: 'cort%' }] },
    { filters: [{ column: 'AGENT_STEP', op: 'eq', value: 'cortando' }] },
    { filters: [{ column: 'content_tasks.agent_step.x', op: 'eq', value: 'cortando' }] },
    { filters: [{ column: 'agent_heartbeat_at.', op: 'gt', value: '2000-01-01' }] },
    { filters: [{ op: 'or', value: 'agent_step..eq.cortando,title.eq.x' }] },
    { filters: [{ op: 'or', value: '(agent_step.eq.cortando)' }] },
    { order: { column: 'agent_heartbeat_at.', ascending: false } },
    { order: { column: 'content_tasks.agent_heartbeat_at.x' } },
    { select: 'id, AGENT_STEP as etapa' },
  ];
  for (const extra of sneaky) {
    r = await dbq(T.editor, { table: 'content_tasks', operation: 'select', select: 'id', filters: [{ column: 'id', op: 'in', value: TASKS }], ...extra });
    assert.equal(r.status, 403, `sem Pulse Plus: ${JSON.stringify(extra)} → ${r.status}`);
  }
  const joinByReviewer = (auth, on) => dbq(auth, {
    table: 'profiles', operation: 'select', select: 'profiles.id',
    joins: [{ table: 'content_tasks', type: 'inner', ...on }],
  });
  r = await joinByReviewer(T.editor, { leftTable: 'profiles', leftColumn: 'id', rightTable: 'content_tasks', rightColumn: 'agent_review_by' });
  assert.equal(r.status, 403, 'join pelo revisor agente');
  r = await joinByReviewer(T.editor, { on: 'profiles.id = content_tasks.agent_review_by' });
  assert.equal(r.status, 403, 'join (texto) pelo revisor agente');
  r = await joinByReviewer(T.plus, { leftTable: 'profiles', leftColumn: 'id', rightTable: 'content_tasks', rightColumn: 'agent_review_by' });
  assert.equal(r.status, 200);
  assert.ok(r.json.data.some((p) => p.id === ids.agent), 'com Pulse Plus o join funciona');
  r = await dbq(T.plus, { table: 'content_tasks', operation: 'select', select: 'id', filters: [{ column: 'agent_step.', op: 'eq', value: 'cortando' }] });
  assert.equal(r.status, 200);
  ok('sem Pulse Plus, coluna interna não entra por ponto no fim, tabela.coluna.x, maiúsculas, "or", ordem, apelido nem ON do join');

  // ── Colunas de texto limpas: não dá para filtrar, ordenar nem renomear (escolheria as linhas de agente) ──
  const textProbes = [
    { table: 'design_task_history', filters: [{ column: 'action', op: 'like', value: '%(agente)' }] },
    { table: 'design_task_history', filters: [{ column: 'details.', op: 'ilike', value: '%arquivo%' }] },
    { table: 'design_task_history', select: 'task_id, action as acao' },
    { table: 'task_history', filters: [{ column: 'action', op: 'eq', value: 'Parecer da Análise' }] },
    { table: 'task_history', order: { column: 'action' } },
    { table: 'design_tasks', filters: [{ column: 'observations', op: 'like', value: '🤖 Análise IA%' }] },
    { table: 'content_tasks', filters: [{ op: 'or', value: 'description.ilike.%PULSE%' }] },
    { table: 'notifications', filters: [{ column: 'message', op: 'ilike', value: '%agente%' }] },
    { table: 'whatsapp_messages', filters: [{ column: 'trigger_type', op: 'eq', value: 'assistente' }], auth: T.admin },
    { table: 'financial_activity_log', filters: [{ column: 'description', op: 'ilike', value: '%PULSE%' }], auth: T.admin },
  ];
  for (const { auth = T.editor, ...probe } of textProbes) {
    r = await dbq(auth, { operation: 'select', select: probe.select || '*', ...probe });
    assert.equal(r.status, 403, `sem Pulse Plus: ${JSON.stringify(probe)} → ${r.status}`);
  }
  r = await dbq(T.admin, { table: 'design_task_history', operation: 'delete', filters: [{ column: 'action', op: 'like', value: '%(agente)' }] });
  assert.equal(r.status, 403, 'nem para apagar (admin sem Pulse Plus)');
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM design_task_history WHERE task_id = $1`, [ids.design])).rows[0].n, 2);
  r = await dbq(T.plus, { table: 'design_task_history', operation: 'select', select: 'action', filters: [{ column: 'action', op: 'like', value: '%(agente)' }] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data.map((h) => h.action), ['Arte iniciada (agente)']);
  r = await dbq(T.editor, { table: 'task_history', operation: 'select', select: '*', filters: [{ column: 'task_id', op: 'eq', value: ids.taskWork }], order: { column: 'created_at' } });
  assert.equal(r.status, 200, 'filtrar e ordenar pelas outras colunas segue livre');
  ok('sem Pulse Plus, histórico, avisos, observações, descrição, financeiro e gatilho do WhatsApp não servem de filtro, ordem nem apelido');

  // ── Textos que o PULSE gravou antes: cards e financeiro ──
  r = await dbq(T.editor, { table: 'content_tasks', operation: 'select', select: '*', filters: [{ column: 'id', op: 'eq', value: ids.taskPulse }] });
  assert.equal(r.json.data[0].description, 'Pedido pelo WhatsApp — Thiago\n\nReels de clareamento');
  r = await dbq(T.editor, { table: 'task_history', operation: 'select', select: '*', filters: [{ column: 'task_id', op: 'eq', value: ids.taskPulse }] });
  assert.equal(r.json.data[0].action, 'Card criado pelo WhatsApp');
  r = await dbq(T.editor, { table: 'design_tasks', operation: 'select', select: 'id, description', filters: [{ column: 'id', op: 'eq', value: ids.design }] });
  assert.equal(r.json.data[0].description, 'Pedido pelo WhatsApp — Thiago\n\nArte da promoção');
  r = await api('GET', '/design-tasks/fast', null, { auth: T.editor });
  assert.equal(r.json.find((t) => t.id === ids.design).description, 'Pedido pelo WhatsApp — Thiago\n\nArte da promoção');
  r = await dbq(T.plus, { table: 'content_tasks', operation: 'select', select: 'description', filters: [{ column: 'id', op: 'eq', value: ids.taskPulse }] });
  assert.match(r.json.data[0].description, /^🤖 Pedido pelo PULSE \(WhatsApp\)/, 'com Pulse Plus, como está gravado');
  r = await dbq(T.admin, { table: 'financial_activity_log', operation: 'select', select: '*', filters: [{ column: 'entity_id', op: 'eq', value: ids.fin }] });
  assert.equal(r.status, 200);
  assert.equal(r.json.data[0].description, 'Registrou despesa - R$ 50,00 - Almoço');
  assert.deepEqual(r.json.data[0].details, { valor: 50, descricao: 'Almoço' });
  r = await dbq(T.plus, { table: 'financial_activity_log', operation: 'select', select: '*', filters: [{ column: 'entity_id', op: 'eq', value: ids.fin }] });
  assert.match(r.json.data[0].description, /\(PULSE, Thiago\)$/);
  assert.equal(r.json.data[0].details.origem, 'assistente_pulse');
  ok('cards e lançamentos antigos do PULSE: sem robô nem "PULSE" para quem não tem Pulse Plus (texto e details); com Pulse Plus, como gravado');

  // ── Foto antiga de agente: endereço neutro para todos, servido pela API ──
  const neutralAvatar = `https://agenciapulse.tech/api/avatar-files/${ids.agent}/foto.png`;
  for (const who of ['editor', 'plus']) {
    r = await dbq(T[who], { table: 'profiles', operation: 'select', select: 'id, avatar_url', filters: [{ column: 'id', op: 'eq', value: ids.agent }] });
    assert.equal(r.json.data[0].avatar_url, neutralAvatar, who);
  }
  r = await api('GET', '/design-tasks/fast', null, { auth: T.editor });
  assert.equal(r.json.find((t) => t.id === ids.design).profiles.avatar_url, neutralAvatar);
  r = await api('GET', '/tv-dashboard?_=1', null, { auth: T.editor });
  const tvText = JSON.stringify(r.json);
  assert.ok(!tvText.includes('avatars/agentes'), `TV sem o endereço antigo: ${tvText.slice(Math.max(0, tvText.indexOf('avatars/agentes') - 200), tvText.indexOf('avatars/agentes') + 80)}`);
  r = await api('GET', '/public-team-presentation', null, { auth: null });
  assert.ok(!JSON.stringify(r.json).includes('avatars/agentes'), 'apresentação sem o endereço antigo');
  const img = await fetch(`${BASE}/avatar-files/${ids.agent}/foto.png`);
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type') || '', /image\/png/);
  for (const bad of [`/avatar-files/${ids.agent}/..%2F..%2F..%2Fetc%2Fpasswd`, `/avatar-files/${ids.agent}/foto.txt`, `/avatar-files/..%2F..%2Fx/foto.png`, `/avatar-files/${ids.agent}/nao-existe.png`]) {
    assert.equal((await fetch(`${BASE}${bad}`)).status, 404, bad);
  }
  assert.equal((await row(`SELECT avatar_url FROM profiles WHERE id = $1`, [ids.agent])).avatar_url, AGENT_AVATAR, 'banco intacto');
  ok('foto antiga de agente sai por um endereço neutro (/api/avatar-files) na Equipe, nos cards, na TV e na apresentação; banco e arquivo intactos');

  // ── Escritório, presença e TV: nada que marque alguém como agente ──
  r = await api('GET', '/presence', null, { auth: T.editor });
  assert.ok(r.status < 500);
  assert.ok(!/agent/i.test(JSON.stringify(r.json || {})), 'presença sem campo de agente');
  r = await api('GET', '/tv-dashboard', null, { auth: T.editor });
  assert.equal(r.status, 200);
  const tv = JSON.stringify(r.json);
  assert.ok(!/agent_step|agent_heartbeat|agent_review|"agente"|agent_keys/i.test(tv), 'TV sem informação interna de agente');
  ok('presença e TV sem campo ou rótulo de agente');

  // ── WhatsApp: o número do PULSE e a função "assistente" ──
  r = await api('GET', '/whatsapp/connections', null, { auth: T.admin });
  assert.equal(r.status, 200);
  assert.ok(!r.json.connections.some((c) => c.id === ids.waPulse), 'conexão do PULSE some');
  assert.deepEqual(r.json.connections.find((c) => c.id === ids.waMixed).purposes, ['aprovacao']);
  assert.ok(!('assistente' in r.json.purposes));
  r = await api('PATCH', `/whatsapp/connections/${ids.waPulse}`, { name: 'Outro' }, { auth: T.admin });
  assert.equal(r.status, 404);
  r = await api('POST', `/whatsapp/connections/${ids.waPulse}/disconnect`, null, { auth: T.admin });
  assert.equal(r.status, 404);
  r = await api('POST', '/whatsapp/connections', { name: 'Nova', purposes: ['assistente'] }, { auth: T.admin });
  assert.equal(r.status, 400);
  r = await api('PATCH', `/whatsapp/connections/${ids.waMixed}`, { purposes: ['aprovacao', 'agenda'] }, { auth: T.admin });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.connection.purposes, ['aprovacao', 'agenda']);
  assert.deepEqual((await row(`SELECT purposes FROM wa_connections WHERE id = $1`, [ids.waMixed])).purposes, ['aprovacao', 'agenda', 'assistente'], 'função do PULSE preservada');
  r = await api('GET', '/whatsapp/connections');
  assert.ok(r.json.connections.some((c) => c.id === ids.waPulse));
  assert.ok('assistente' in r.json.purposes);
  ok('WhatsApp: sem Pulse Plus o número do PULSE e a função "assistente" não aparecem nem se mexem; com, tudo como antes');

  // ── Trava: card com agente trabalhando ──
  const move = (auth, id, data) => dbq(auth, { table: 'content_tasks', operation: 'update', data, filters: [{ column: 'id', op: 'eq', value: id }] });
  r = await move(T.admin, ids.taskWork, { kanban_column: 'revisao' });
  assert.equal(r.status, 409);
  assert.match(r.json.error.message, /^Bia está trabalhando neste card/);
  assert.ok(!/agente|IA\b/.test(r.json.error.message));
  r = await move(T.admin, ids.taskWork, { kanban_column: 'alteracao', assigned_to: ids.editor });
  assert.equal(r.status, 409, 'mudar a coluna junto com o dono também trava');
  r = await move(T.admin, ids.taskWork, { title: 'Vídeo com agente (título novo)' });
  assert.equal(r.status, 200, 'editar outro campo continua livre');
  assert.equal(r.json.data[0].agent_step, null, 'RETURNING também sem a coluna interna');
  assert.equal((await row(`SELECT agent_step FROM content_tasks WHERE id = $1`, [ids.taskWork])).agent_step, 'cortando');
  r = await move(T.admin, ids.taskWork, { kanban_column: 'edicao', assigned_to: ids.agent, title: 'Vídeo com agente' });
  assert.equal(r.status, 200, 'salvar o card sem mudar coluna nem dono continua livre');
  assert.equal((await row(`SELECT agent_step FROM content_tasks WHERE id = $1`, [ids.taskWork])).agent_step, 'cortando', 'e a etapa fica');
  // trocar o responsável continua livre (o "Tirar mesmo assim" do Controle de Edição e a ficha do card) e limpa a etapa
  r = await move(T.admin, ids.taskWork, { assigned_to: ids.editor });
  assert.equal(r.status, 200, 'troca de dono não trava');
  assert.deepEqual(await row(`SELECT kanban_column, assigned_to, agent_step, agent_heartbeat_at FROM content_tasks WHERE id = $1`, [ids.taskWork]),
    { kanban_column: 'edicao', assigned_to: ids.editor, agent_step: null, agent_heartbeat_at: null });
  ok('vídeo com agente dando sinal não muda de coluna por quem não vê o agente (mensagem neutra); trocar o responsável é livre e limpa a etapa');

  // arte: a mesma trava de coluna enquanto o agente cria ou corrige (sinal recente); trocar o dono é livre
  const moveArt = (data) => dbq(T.admin, { table: 'design_tasks', operation: 'update', data, filters: [{ column: 'id', op: 'eq', value: ids.design }] });
  r = await moveArt({ kanban_column: 'em_analise' });
  assert.equal(r.status, 409);
  assert.match(r.json.error.message, /^Bia está trabalhando neste card agora\. Espere a entrega para mover\.$/);
  assert.equal((await row(`SELECT kanban_column, agent_step FROM design_tasks WHERE id = $1`, [ids.design])).agent_step, 'montando');
  r = await dbq(T.plus, { table: 'design_tasks', operation: 'update', data: { priority: 'alta' }, filters: [{ column: 'id', op: 'eq', value: ids.design }] });
  assert.equal(r.status, 200, 'quem tem Pulse Plus segue como antes');
  r = await moveArt({ assigned_to: ids.editor });
  assert.equal(r.status, 200);
  assert.deepEqual(await row(`SELECT kanban_column, assigned_to, agent_step, agent_heartbeat_at FROM design_tasks WHERE id = $1`, [ids.design]),
    { kanban_column: 'executando', assigned_to: ids.editor, agent_step: null, agent_heartbeat_at: null });
  // de volta com a agente, parada (sem sinal há 2 h): a arte sai de coluna e a etapa sai junto
  await pool.query(`UPDATE design_tasks SET assigned_to = $2, agent_step = 'montando', agent_heartbeat_at = now() - interval '2 hours' WHERE id = $1`, [ids.design, ids.agent]);
  r = await moveArt({ kanban_column: 'em_analise' });
  assert.equal(r.status, 200);
  assert.deepEqual(await row(`SELECT kanban_column, agent_step, agent_heartbeat_at FROM design_tasks WHERE id = $1`, [ids.design]),
    { kanban_column: 'em_analise', agent_step: null, agent_heartbeat_at: null });
  ok('arte com agente dando sinal não muda de coluna por quem não vê o agente; dono livre; parada, sai e limpa a etapa');

  // ── O agente segue trabalhando com a chave ──
  r = await api('GET', '/agent/me', null, { auth: AGENT_KEY });
  assert.equal(r.status, 200);
  assert.equal(r.json.id, ids.agent);
  r = await api('GET', '/agent/queue', null, { auth: AGENT_KEY });
  assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
  r = await api('POST', `/agent/tasks/${ids.taskFree}/claim`, {}, { auth: AGENT_KEY });
  assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
  r = await api('POST', `/agent/tasks/${ids.taskFree}/heartbeat`, { step: 'renderizando' }, { auth: AGENT_KEY });
  assert.equal(r.status, 200);
  const claimed = await row(`SELECT assigned_to, agent_step FROM content_tasks WHERE id = $1`, [ids.taskFree]);
  assert.deepEqual(claimed, { assigned_to: ids.agent, agent_step: 'renderizando' });
  r = await api('POST', '/agent/status', { status: 'trabalhando' }, { auth: AGENT_KEY });
  assert.equal(r.status, 200);
  ok('o agente pega o card, dá sinal de vida e atualiza o status pela chave, como antes');

  // ── Marcar e desmarcar na Equipe ──
  r = await api('GET', '/team/pulse-plus', null, { auth: T.admin });
  assert.equal(r.status, 403);
  r = await api('POST', `/team/${ids.admin}/pulse-plus`, null, { auth: T.admin });
  assert.equal(r.status, 403, 'admin sem Pulse Plus não se dá o acesso');
  r = await api('POST', `/team/${ids.editor}/pulse-plus`, null, { auth: T.editor });
  assert.equal(r.status, 403);
  r = await api('GET', '/team/pulse-plus');
  assert.deepEqual(r.json.members.map((m) => m.user_id), [ids.plus]);
  r = await api('POST', `/team/${ids.admin}/pulse-plus`);
  assert.equal(r.status, 200);
  r = await api('GET', '/agents/office', null, { auth: T.admin });
  assert.equal(r.status, 200, 'acesso vale na hora (cache limpo)');
  r = await dbq(T.admin, ctSelect);
  assert.equal(r.json.data.find((t) => t.id === ids.taskReview).agent_review_verdict, 'ajustes');
  const log = await row(`SELECT action, actor_id, actor_name FROM module_access_log WHERE module = 'pulse_plus' AND user_id = $1 ORDER BY id DESC LIMIT 1`, [ids.admin]);
  assert.deepEqual(log, { action: 'incluido', actor_id: ids.plus, actor_name: 'Paula Plus' });
  assert.match((await row(`SELECT created_by FROM module_access WHERE module = 'pulse_plus' AND user_id = $1`, [ids.admin])).created_by, /Paula Plus/);
  // editor com Pulse Plus vê os agentes, mas não marca ninguém (precisa ser admin)
  r = await api('POST', `/team/${ids.editor}/pulse-plus`);
  assert.equal(r.status, 200);
  r = await api('GET', '/agents/office', null, { auth: T.editor });
  assert.equal(r.status, 200);
  r = await api('POST', `/team/${ids.agent}/pulse-plus`, null, { auth: T.editor });
  assert.equal(r.status, 403);
  r = await api('DELETE', `/team/${ids.editor}/pulse-plus`, null, { auth: T.admin });
  assert.equal(r.status, 200, 'o admin marcado também marca e desmarca');
  r = await api('GET', '/agents/office', null, { auth: T.editor });
  assert.equal(r.status, 403, 'desmarcado perde o acesso na hora');
  r = await api('DELETE', `/team/${ids.admin}/pulse-plus`);
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT action FROM module_access_log WHERE module = 'pulse_plus' AND user_id = $1 ORDER BY id DESC LIMIT 1`, [ids.admin])).action, 'removido');
  r = await api('GET', '/agents/office', null, { auth: T.admin });
  assert.equal(r.status, 403);
  r = await api('DELETE', `/team/${ids.plus}/pulse-plus`);
  assert.equal(r.status, 409, 'não tira o último');
  assert.ok(await row(`SELECT 1 FROM module_access WHERE module = 'pulse_plus' AND user_id = $1`, [ids.plus]));
  r = await api('POST', `/team/not-a-uuid/pulse-plus`);
  assert.equal(r.status, 400);
  r = await api('POST', `/team/00000000-0000-0000-0000-00000000b7ff/pulse-plus`);
  assert.equal(r.status, 404);
  ok('Equipe: só admin com Pulse Plus marca e desmarca (registrado), vale na hora e o último não sai');

  // ── Fase 2: lista vazia e nada nos Agendamentos → admin "Thiago" ──
  await stopServer(server);
  await pool.query(`DELETE FROM module_access WHERE module IN ('pulse_plus', 'agendamentos')`);
  await pool.query(`INSERT INTO profiles (id, name, email, role) VALUES ($1, 'Thiago Teste Plus', 'thiago.plus@teste.local', 'editor')`, [ids.thiago]);
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [ids.thiago]);
  server = startServer();
  await waitHealthy(server);
  await waitFor(async () => server.log.includes('[pulse-plus]'), 'segunda semente');
  // a semente dos Agendamentos (mesma regra) roda antes; o Pulse Plus copia de lá ou aplica a regra direto
  assert.match(server.log, /\[pulse-plus\] acesso semeado \((quem estava nos Agendamentos|admin "Thiago")\) com: .*Thiago Teste Plus/);
  list = (await pool.query(`SELECT user_id FROM module_access WHERE module = 'pulse_plus'`)).rows.map((r) => r.user_id);
  assert.ok(list.includes(ids.thiago), 'admin "Thiago" (pela função em user_roles) entrou');
  assert.ok(!list.includes(ids.plus) && !list.includes(ids.admin), 'os outros admins ficam de fora');
  ok('semente sem lista dos Agendamentos: entra o admin cujo nome começa com "Thiago"');

  console.log('\nPulse Plus: tudo certo.');
} catch (error) {
  console.error('\nFALHOU:', error?.stack || error);
  console.error('\n--- log do servidor (fim) ---\n', server.log.slice(-4000));
  process.exitCode = 1;
} finally {
  await stopServer(server);
  await cleanup();
  await pool.end();
}

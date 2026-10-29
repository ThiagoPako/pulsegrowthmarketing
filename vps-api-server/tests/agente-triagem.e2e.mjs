// Teste de ponta a ponta do agente de triagem do Drive (agentTriageRoutes.mjs, função 'triagem' das chaves).
// A triagem só cria cards: brutos → Edição (fila livre, com prazo), material de arte → Design (Nova tarefa).
// O link do Drive não duplica card; a triagem não pega vídeo; editor não usa as rotas; pausa bloqueia.
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_triagem node tests/agente-triagem.e2e.mjs
// O banco precisa ter o esquema da produção (ex.: CREATE DATABASE pulse_triagem TEMPLATE pulse_db).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:teste@localhost:55432/pulse_triagem';
const PORT = Number(process.env.TEST_API_PORT || 5073);
const BASE = `http://127.0.0.1:${PORT}/api`;
const pool = new pg.Pool({ connectionString: DB });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-triagem-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);

const ids = {
  triagem: '00000000-0000-0000-0000-00000000c701', // agente de triagem (Severino)
  editor: '00000000-0000-0000-0000-00000000c702',  // agente editor
  client: '00000000-0000-0000-0000-00000000c711',
};
const PEOPLE = [ids.triagem, ids.editor];
const TRIAGE_KEY = `pa_teste_triagem_${crypto.randomBytes(6).toString('hex')}`;
const EDITOR_KEY = `pa_teste_triagem_ed_${crypto.randomBytes(6).toString('hex')}`;
const BRUTOS = 'https://drive.google.com/drive/folders/brutos-teste-triagem';
const ARTE = 'https://drive.google.com/drive/folders/arte-teste-triagem';
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

async function cleanup() {
  const { rows: content } = await pool.query(`SELECT id FROM content_tasks WHERE client_id = $1`, [ids.client]).catch(() => ({ rows: [] }));
  const { rows: design } = await pool.query(`SELECT id FROM design_tasks WHERE client_id = $1`, [ids.client]).catch(() => ({ rows: [] }));
  await pool.query(`DELETE FROM task_history WHERE task_id = ANY($1)`, [content.map((r) => r.id)]).catch(() => {});
  await pool.query(`DELETE FROM design_task_history WHERE task_id = ANY($1)`, [design.map((r) => r.id)]).catch(() => {});
  await pool.query(`DELETE FROM content_tasks WHERE client_id = $1`, [ids.client]).catch(() => {});
  await pool.query(`DELETE FROM design_tasks WHERE client_id = $1`, [ids.client]).catch(() => {});
  await pool.query(`DELETE FROM agent_pauses WHERE scope = $1`, [ids.triagem]).catch(() => {});
  await pool.query(`DELETE FROM agent_keys WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE id = $1`, [ids.client]).catch(() => {});
  await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [PEOPLE]).catch(() => {});
}

function startServer() {
  const child = spawn('node', [path.join(API_DIR, 'server.mjs')], {
    cwd: API_DIR,
    env: {
      ...process.env, DATABASE_URL: DB, JWT_SECRET: 'segredo-teste-triagem', API_PORT: String(PORT),
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

async function call(key, method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { Authorization: `Agent ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

await cleanup();
await pool.query(
  `INSERT INTO profiles (id, name, email, role) VALUES ($1, 'Severino Teste', 'severino.triagem@teste.local', 'editor'),
                                                       ($2, 'Davi Teste', 'davi.triagem@teste.local', 'editor')`,
  PEOPLE
);
await pool.query(`INSERT INTO clients (id, company_name, city, status, color) VALUES ($1, 'Cliente Triagem', 'minacu', 'ativo', '200 80% 45%')`, [ids.client]);
await pool.query(
  `INSERT INTO agent_keys (user_id, role, key_hash, key_hint) VALUES ($1, 'triagem', $2, 'tria'), ($3, 'editor', $4, 'edit')`,
  [ids.triagem, sha256(TRIAGE_KEY), ids.editor, sha256(EDITOR_KEY)]
).catch(async (error) => {
  // banco novo: agent_keys nasce na subida do servidor; as chaves entram depois
  if (!/agent_keys/.test(error.message)) throw error;
});

const server = startServer();
process.on('exit', () => { try { server.child.kill(); } catch {} });
try {
  await waitHealthy(server);
  const { rowCount } = await pool.query(`SELECT 1 FROM agent_keys WHERE user_id = $1`, [ids.triagem]);
  if (!rowCount) {
    await pool.query(
      `INSERT INTO agent_keys (user_id, role, key_hash, key_hint) VALUES ($1, 'triagem', $2, 'tria'), ($3, 'editor', $4, 'edit')`,
      [ids.triagem, sha256(TRIAGE_KEY), ids.editor, sha256(EDITOR_KEY)]
    );
  }

  // ── Card de Edição ──
  let r = await call(TRIAGE_KEY, 'POST', '/agent/triage/content-cards', {
    client_id: ids.client, title: 'Brutos 28/10 — depoimento', drive_link: BRUTOS, content_type: 'reels', description: 'Gravação de terça',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ja_existia, false);
  const contentId = r.body.task.id;
  const { rows: [card] } = await pool.query(`SELECT * FROM content_tasks WHERE id = $1`, [contentId]);
  assert.equal(card.kanban_column, 'edicao');
  assert.equal(card.drive_link, BRUTOS);
  assert.equal(card.assigned_to, null, 'entra livre na fila');
  assert.equal(card.created_by, ids.triagem);
  assert.ok(card.editing_deadline, 'prazo de edição do sistema');
  const { rows: hist } = await pool.query(`SELECT action, user_id FROM task_history WHERE task_id = $1`, [contentId]);
  assert.deepEqual(hist.map((h) => [h.action, h.user_id]), [['Card criado', ids.triagem]]);
  ok('brutos viram card de Edição livre na fila, com prazo e histórico no nome do agente');

  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/content-cards', { client_id: ids.client, title: 'Outro título', drive_link: BRUTOS });
  assert.equal(r.status, 200);
  assert.equal(r.body.ja_existia, true);
  assert.equal(r.body.task.id, contentId);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM content_tasks WHERE client_id = $1`, [ids.client])).rows[0].n, 1);
  ok('mesmo link dos brutos não duplica o card');

  r = await call(EDITOR_KEY, 'GET', '/agent/queue');
  assert.ok(r.body.tasks.some((t) => t.id === contentId), 'o card aparece na fila dos editores');
  r = await call(TRIAGE_KEY, 'GET', '/agent/queue');
  assert.deepEqual(r.body.tasks, [], 'a triagem não tem fila de vídeo');
  r = await call(TRIAGE_KEY, 'POST', `/agent/tasks/${contentId}/claim`);
  assert.equal(r.status, 403);
  ok('a triagem não pega vídeo; o card fica para os editores');

  // ── Card de Design ──
  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/design-cards', {
    client_id: ids.client, title: 'Arte promoção de novembro', materials_link: ARTE, format: 'story', priority: 'alta',
    due_date: '2026-11-05', copy_text: 'Black Friday 30% OFF',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ja_existia, false);
  const designId = r.body.task.id;
  const { rows: [art] } = await pool.query(`SELECT * FROM design_tasks WHERE id = $1`, [designId]);
  assert.equal(art.kanban_column, 'nova_tarefa');
  assert.equal(art.format_type, 'story');
  assert.equal(art.dimensions?.preset, 'story');
  assert.equal(art.priority, 'alta');
  assert.equal(art.materials_link, ARTE);
  assert.equal(art.created_by, ids.triagem);
  ok('material de arte vira card de Design em Nova tarefa, com formato e prioridade');

  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/design-cards', { client_id: ids.client, title: 'Repetida', materials_link: ARTE });
  assert.equal(r.body.ja_existia, true);
  assert.equal(r.body.task.id, designId);
  r = await call(TRIAGE_KEY, 'GET', `/agent/triage/existing?link=${encodeURIComponent(ARTE)}`);
  assert.deepEqual(r.body.design.map((t) => t.id), [designId]);
  ok('mesmo link do material não duplica; "existe" mostra o card');

  // ── Validações e permissões ──
  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/content-cards', { client_id: ids.client, title: 'X', drive_link: 'https://exemplo.com/x' });
  assert.equal(r.status, 400);
  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/design-cards', { client_id: ids.client, title: 'X', materials_link: `${ARTE}-2`, format: 'gigante' });
  assert.equal(r.status, 400);
  r = await call(EDITOR_KEY, 'POST', '/agent/triage/content-cards', { client_id: ids.client, title: 'X', drive_link: `${BRUTOS}-2` });
  assert.equal(r.status, 403);
  r = await call('pa_chave_errada', 'POST', '/agent/triage/content-cards', { client_id: ids.client, title: 'X', drive_link: `${BRUTOS}-2` });
  assert.equal(r.status, 401);
  ok('link fora do Drive, formato inválido, editor e chave errada são recusados');

  await pool.query(`INSERT INTO agent_pauses (scope, reason) VALUES ($1, 'teste')`, [ids.triagem]);
  r = await call(TRIAGE_KEY, 'POST', '/agent/triage/content-cards', { client_id: ids.client, title: 'X', drive_link: `${BRUTOS}-3` });
  assert.equal(r.status, 423);
  ok('pausado pelo sistema não cria card');

  console.log('\nTriagem do Drive: tudo certo.');
} catch (error) {
  console.error('\nFALHOU:', error?.stack || error);
  console.error('\n--- log do servidor (fim) ---\n', server.log.slice(-4000));
  process.exitCode = 1;
} finally {
  if (server.child.exitCode === null) {
    server.child.kill();
    await new Promise((r) => server.child.once('exit', r));
  }
  await cleanup();
  await pool.end();
}

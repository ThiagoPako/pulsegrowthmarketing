// Teste de ponta a ponta do módulo de Agendamentos (sem Meta: nenhuma mídia é https, então a
// fila nunca chega a chamar a API da Meta; as contas usam token falso e api_base 'facebook').
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_agendamentos node tests/agendamentos.e2e.mjs
// O banco precisa ter o esquema da produção (ex.: CREATE DATABASE pulse_agendamentos TEMPLATE pulse_db).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { brtParts, brtToIso } from '../lib/postingTime.mjs';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:teste@localhost:55432/pulse_agendamentos';
const PORT = Number(process.env.TEST_API_PORT || 4872);
const SECRET = 'segredo-teste-agendamentos';
const BASE = `http://127.0.0.1:${PORT}/api`;
pg.types.setTypeParser(1082, (value) => value); // DATE como AAAA-MM-DD, igual ao servidor
const pool = new pg.Pool({ connectionString: DB });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-agendamentos-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);
// Mídia de teste: http local fechado. A fila só publica https, então nada sai para a Meta.
const MEDIA = (name) => `http://127.0.0.1:9/${name}`;

const ids = {
  thiago: '00000000-0000-0000-0000-00000000a601', other: '00000000-0000-0000-0000-00000000a602',
  social: '00000000-0000-0000-0000-00000000a603',
  cliMin: '00000000-0000-0000-0000-00000000a611', cliNoAcc: '00000000-0000-0000-0000-00000000a612',
  cliUru: '00000000-0000-0000-0000-00000000a613',
  taskA: '00000000-0000-0000-0000-00000000a621', taskB: '00000000-0000-0000-0000-00000000a622',
  taskEnvio: '00000000-0000-0000-0000-00000000a623', taskUru: '00000000-0000-0000-0000-00000000a624',
  taskLegacy: '00000000-0000-0000-0000-00000000a625',
  design: '00000000-0000-0000-0000-00000000a631', design2: '00000000-0000-0000-0000-00000000a632',
  portal: '00000000-0000-0000-0000-00000000a641', script: '00000000-0000-0000-0000-00000000a651',
  // histórico do portal sem vínculo (antes de 25/10): não pode voltar como "não agendado"
  taskMay: '00000000-0000-0000-0000-00000000a626', portalMay: '00000000-0000-0000-0000-00000000a642',
  portalOld: '00000000-0000-0000-0000-00000000a643', portalSolo: '00000000-0000-0000-0000-00000000a644',
  portalA: '00000000-0000-0000-0000-00000000a645', design3: '00000000-0000-0000-0000-00000000a633',
  design4: '00000000-0000-0000-0000-00000000a634',
};
const CLIENTS = [ids.cliMin, ids.cliNoAcc, ids.cliUru];
const PEOPLE = [ids.thiago, ids.other, ids.social];

async function waitFor(fn, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`tempo esgotado: ${label}`);
    await sleep(300);
  }
}

const today = brtParts(new Date()).date;
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthStart = `${today.slice(0, 8)}01`;
const rangeFrom = addDays(today, -40);
const rangeTo = addDays(today, 40);

async function fixtures() {
  await pool.query(`DELETE FROM scheduled_posts WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM task_history WHERE task_id IN (SELECT id FROM content_tasks WHERE client_id = ANY($1))`, [CLIENTS]);
  await pool.query(`DELETE FROM design_task_history WHERE task_id IN (SELECT id FROM design_tasks WHERE client_id = ANY($1))`, [CLIENTS]);
  await pool.query(`DELETE FROM social_media_deliveries WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM client_portal_notifications WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM client_portal_contents WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM content_tasks WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM design_tasks WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM scripts WHERE id = $1`, [ids.script]);
  await pool.query(`DELETE FROM social_accounts WHERE client_id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM clients WHERE id = ANY($1)`, [CLIENTS]);
  await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [PEOPLE]);
  await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [PEOPLE]);

  await pool.query(
    `INSERT INTO profiles (id, name, email, role) VALUES
       ($1, 'Thiago Pereira', 'thiago.agendamentos@teste.local', 'admin'),
       ($2, 'Carla Admin', 'carla.agendamentos@teste.local', 'admin'),
       ($3, 'Sofia Social', 'sofia.agendamentos@teste.local', 'social_media')`,
    [ids.thiago, ids.other, ids.social]
  );
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin'), ($2, 'admin'), ($3, 'social_media')`,
    [ids.thiago, ids.other, ids.social]);
  await pool.query(
    `INSERT INTO clients (id, company_name, city, status, color, logo_url) VALUES
       ($1, 'Clínica Agenda', 'minacu', 'ativo', '330 80% 55%', NULL),
       ($2, 'Padaria Sem Conta', 'minacu', 'ativo', '30 90% 50%', NULL),
       ($3, 'Ótica Uruaçu', 'uruacu', 'ativo', '200 80% 45%', NULL)`,
    CLIENTS
  );
  await pool.query(
    `INSERT INTO social_accounts (client_id, platform, account_name, username, instagram_business_id, access_token, status, api_base)
     VALUES ($1, 'instagram', 'clinica.agenda', 'clinica.agenda', '1789000000001', 'token-falso-teste', 'connected', 'facebook')`,
    [ids.cliMin]
  );
  await pool.query(`INSERT INTO scripts (id, client_id, title, caption) VALUES ($1, $2, 'Roteiro A', 'Legenda do roteiro A')`, [ids.script, ids.cliMin]);
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link, approved_at, script_id) VALUES
       ($1, $5, 'Vídeo A', 'reels', 'agendamentos', $9, now() - interval '2 days', $10),
       ($2, $6, 'Vídeo B', 'reels', 'agendamentos', $9, now() - interval '1 day', NULL),
       ($3, $5, 'Vídeo em envio', 'reels', 'envio', $9, NULL, NULL),
       ($4, $7, 'Vídeo Uruaçu', 'story', 'agendamentos', $9, now(), NULL),
       ($8, $6, 'Vídeo legado', 'reels', 'acompanhamento', $9, now() - interval '3 days', NULL)`,
    [ids.taskA, ids.taskB, ids.taskEnvio, ids.taskUru, ids.cliMin, ids.cliNoAcc, ids.cliUru, ids.taskLegacy, MEDIA('video.mp4'), ids.script]
  );
  // Card agendado pelas Entregas Social antes do módulo (data só na entrega)
  await pool.query(
    `INSERT INTO social_media_deliveries (client_id, content_type, title, status, posted_at, scheduled_time, content_task_id)
     VALUES ($1, 'reels', 'Vídeo legado', 'agendado', $2, '18:00', $3)`,
    [ids.cliNoAcc, addDays(today, 2), ids.taskLegacy]
  );
  await pool.query(`UPDATE content_tasks SET posting_at = NULL WHERE id = $1`, [ids.taskLegacy]);
  await pool.query(
    `INSERT INTO design_tasks (id, client_id, title, format_type, kanban_column, attachment_url, client_approved_at) VALUES
       ($1, $3, 'Arte Promo', 'feed', 'aprovado', $4, now() - interval '1 day'),
       ($2, $3, 'Panfleto impresso', 'midia_fisica', 'aprovado', $5, now()),
       ($6, $3, 'Arte Troca', 'feed', 'aprovado', $7, now() - interval '1 day'),
       ($8, $3, 'Arte levada cedo', 'feed', 'aprovado', $9, now() - interval '1 day')`,
    [ids.design, ids.design2, ids.cliMin, MEDIA('arte.png'), MEDIA('panfleto.png'), ids.design3, MEDIA('troca.png'), ids.design4, MEDIA('cedo.png')]
  );
  await pool.query(
    `INSERT INTO client_portal_contents (id, client_id, title, content_type, file_url, status, approved_at, season_month, season_year)
     VALUES ($1, $2, 'Vídeo do portal', 'reel', $3, 'aprovado', now(), 1, 2026)`,
    [ids.portal, ids.cliMin, MEDIA('portal.mp4')]
  );
  // Vídeo postado em maio (card arquivado há 2 meses) e a linha antiga do portal, sem vínculo, ainda 'aprovado'
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link, approved_at, updated_at)
     VALUES ($1, $2, 'Vídeo de maio', 'reels', 'arquivado', $3, now() - interval '150 days', now() - interval '60 days')`,
    [ids.taskMay, ids.cliMin, MEDIA('maio.mp4')]
  );
  await pool.query(
    `INSERT INTO client_portal_contents (id, client_id, title, content_type, file_url, status, approved_at, season_month, season_year)
     VALUES ($1, $3, ' vídeo de MAIO ', 'reel', $4, 'aprovado', now() - interval '2 days', 5, 2026),
            ($2, $3, 'Vídeo avulso antigo', 'reel', $5, 'aprovado', now() - interval '60 days', 8, 2026),
            ($6, $3, 'Vídeo avulso novo', 'reel', $7, 'aprovado', now() - interval '1 day', 10, 2026)`,
    [ids.portalMay, ids.portalOld, ids.cliMin, MEDIA('maio.mp4'), MEDIA('antigo.mp4'), ids.portalSolo, MEDIA('solo.mp4')]
  );
  // Vídeo A no portal, ligado ao card (aprovado pelo cliente)
  await pool.query(
    `INSERT INTO client_portal_contents (id, client_id, title, content_type, file_url, status, approved_at, season_month, season_year, content_task_id)
     VALUES ($1, $2, 'Vídeo A', 'reel', $3, 'aprovado', now() - interval '2 days', 10, 2026, $4)`,
    [ids.portalA, ids.cliMin, MEDIA('video.mp4'), ids.taskA]
  );
}

// ── Sobe o servidor ────────────────────────────────────────────
// O módulo agora é liberado pelo Pulse Plus (pulsePlus.mjs), semeado a partir da lista dos Agendamentos
await pool.query(`DELETE FROM module_access WHERE module IN ('agendamentos', 'pulse_plus')`).catch(() => {});
await fixtures().catch(async (error) => {
  // banco novo: as colunas posting_at ainda não existem (o servidor cria na subida)
  if (error?.code !== '42703') throw error;
});
const server = spawn('node', [path.join(API_DIR, 'server.mjs')], {
  cwd: API_DIR,
  env: {
    ...process.env, DATABASE_URL: DB, JWT_SECRET: SECRET, API_PORT: String(PORT),
    ANTHROPIC_API_KEY: '', GOOGLE_GEMINI_API_KEY: '', OPENAI_API_KEY: '',
    UPLOAD_ROOT: path.join(TMP, 'uploads'), PUBLIC_UPLOADS_URL: 'https://agenciapulse.tech/uploads',
    WA_PRIVATE_DIR: path.join(TMP, 'wa'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
  if (i === 59) throw new Error(`servidor não subiu:\n${serverLog.slice(-3000)}`);
}
await waitFor(async () => serverLog.includes('[agendamentos]'), 'semente da lista de acesso');
await waitFor(async () => serverLog.includes('[pulse-plus]'), 'semente do Pulse Plus');
await fixtures();

const token = (id, email, role) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '1h' });
const thiagoToken = token(ids.thiago, 'thiago.agendamentos@teste.local', 'admin');
const otherToken = token(ids.other, 'carla.agendamentos@teste.local', 'admin');
const api = async (method, url, body, { auth = thiagoToken, city = 'minacu' } = {}) => {
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}`, 'x-pulse-city': city },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
// Sessão do portal do cliente (mesmo segredo derivado do servidor)
const PORTAL_SECRET = crypto.createHash('sha256').update(`${SECRET}:pulse-portal-session`).digest('hex');
const portalAction = async (clientId, body) => {
  const r = await fetch(`${BASE}/portal-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-portal-token': jwt.sign({ typ: 'portal', cid: clientId, puid: null }, PORTAL_SECRET, { expiresIn: '1h' }) },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const materials = (clientId, opts) => api('GET', `/scheduling/clients/${clientId}/materials?from=${rangeFrom}&to=${rangeTo}`, null, opts);
const row = async (sql, params) => (await pool.query(sql, params)).rows[0];

try {
  // ── Fuso de Brasília ──
  assert.equal(brtToIso('2026-11-02', '10:30'), '2026-11-02T13:30:00.000Z');
  assert.deepEqual(brtParts('2026-11-03T02:15:00.000Z'), { date: '2026-11-02', time: '23:15' });
  ok('hora de Brasília: 10:30 = 13:30 UTC e 02:15 UTC ainda é o dia anterior');

  // ── Acesso ──
  assert.match(serverLog, /lista de acesso semeada com: Thiago Pereira/);
  const seeded = (await pool.query(`SELECT user_id FROM module_access WHERE module = 'agendamentos'`)).rows.map((r) => r.user_id);
  assert.ok(seeded.includes(ids.thiago), 'Thiago na lista');
  assert.ok(!seeded.includes(ids.other), 'outro admin fora da lista');
  const plus = (await pool.query(`SELECT user_id FROM module_access WHERE module = 'pulse_plus'`)).rows.map((r) => r.user_id);
  assert.deepEqual(plus, [ids.thiago], 'Pulse Plus copiado da lista dos Agendamentos');
  ok('semente: só o admin "Thiago" entrou na lista (e no Pulse Plus, que libera o módulo; o log diz quem)');

  let r = await api('GET', '/me/module-access');
  assert.deepEqual(r.json.modules, ['agendamentos', 'pulse_plus']);
  r = await api('GET', '/me/module-access', null, { auth: otherToken });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.modules, []);
  r = await api('GET', '/scheduling/clients', null, { auth: otherToken });
  assert.equal(r.status, 403);
  r = await api('GET', `/scheduling/clients/${ids.cliMin}/materials?from=${rangeFrom}&to=${rangeTo}`, null, { auth: otherToken });
  assert.equal(r.status, 403);
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA }, { auth: otherToken });
  assert.equal(r.status, 403);
  r = await fetch(`${BASE}/scheduling/clients`);
  assert.equal(r.status, 401);
  ok('admin fora da lista recebe 403 em todas as rotas; sem login, 401');

  // ── Clientes e cidade ──
  r = await api('GET', '/scheduling/clients');
  assert.equal(r.status, 200);
  const names = r.json.clients.map((c) => c.id);
  assert.ok(names.includes(ids.cliMin) && names.includes(ids.cliNoAcc));
  assert.ok(!names.includes(ids.cliUru), 'cliente de Uruaçu fora da lista de Minaçu');
  const cli = r.json.clients.find((c) => c.id === ids.cliMin);
  assert.equal(cli.accounts.instagram, 1);
  assert.equal(cli.pending, 6, 'vídeo A + 3 artes + 2 conteúdos avulsos recentes do portal (o panfleto e o histórico não contam)');
  r = await api('GET', '/scheduling/clients', null, { city: 'uruacu' });
  assert.ok(r.json.clients.some((c) => c.id === ids.cliUru) && !r.json.clients.some((c) => c.id === ids.cliMin));
  r = await materials(ids.cliMin, { city: 'uruacu' });
  assert.equal(r.status, 404);
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: addDays(today, 3), time: '10:30', mode: 'manual' }, { city: 'uruacu' });
  assert.equal(r.status, 404);
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskUru, date: addDays(today, 3), time: '10:30', mode: 'manual' });
  assert.equal(r.status, 404, 'card de outro cliente não passa pelo cliente informado');
  ok('regra de cidade: cliente só aparece e só é agendado na cidade dele');

  // ── Não agendados ──
  r = await materials(ids.cliMin);
  assert.equal(r.status, 200);
  const pendingKeys = r.json.unscheduled.map((i) => i.key);
  assert.ok(pendingKeys.includes(`conteudo:${ids.taskA}`));
  assert.ok(pendingKeys.includes(`arte:${ids.design}`));
  assert.ok(pendingKeys.includes(`portal:${ids.portal}`));
  assert.ok(!pendingKeys.includes(`conteudo:${ids.taskEnvio}`), 'vídeo ainda em envio não aparece');
  assert.ok(!pendingKeys.includes(`arte:${ids.design2}`), 'arte impressa não aparece');
  const itemA = r.json.unscheduled.find((i) => i.key === `conteudo:${ids.taskA}`);
  assert.equal(itemA.caption, 'Legenda do roteiro A');
  assert.equal(itemA.type, 'reels');
  assert.equal(r.json.accounts.length, 1);
  ok('não agendados: vídeo aprovado, arte aprovada e conteúdo aprovado no portal (com a legenda do roteiro)');

  assert.ok(pendingKeys.includes(`portal:${ids.portalSolo}`), 'avulso recente aparece');
  assert.ok(!pendingKeys.includes(`portal:${ids.portalMay}`), 'linha antiga do portal com o título de um card não aparece');
  assert.ok(!pendingKeys.includes(`portal:${ids.portalOld}`), 'avulso aprovado há mais de 45 dias não aparece');
  assert.ok(!r.json.scheduled.some((i) => i.key === `portal:${ids.portalMay}` || i.key === `portal:${ids.portalOld}`));
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portalMay, date: addDays(today, 3), time: '10:00', mode: 'manual' });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'not_ready');
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portalOld, date: addDays(today, 3), time: '10:00', mode: 'manual' });
  assert.equal(r.status, 409);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portalMay, date: addDays(today, 3), time: '10:00' });
  assert.equal(r.status, 409);
  assert.equal(await row(`SELECT posting_at FROM client_portal_contents WHERE id = $1`, [ids.portalMay]).then((x) => x.posting_at), null);
  ok('histórico do portal sem vínculo (título de card, mais de 45 dias) não aparece, não conta e não agenda (409)');

  r = await materials(ids.cliNoAcc);
  const legacy = r.json.scheduled.find((i) => i.key === `conteudo:${ids.taskLegacy}`);
  assert.ok(legacy, 'card agendado antes do módulo aparece no calendário');
  assert.equal(legacy.when.date, addDays(today, 2));
  assert.equal(legacy.when.time, '18:00');
  assert.equal(legacy.state, 'manual');
  ok('card agendado antes pelas Entregas aparece no dia e hora da entrega');

  // ── Agendar com conta conectada ──
  const dayA = addDays(today, 3);
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: dayA, time: '10:30',
    mode: 'auto', platform: 'instagram', publish_type: 'reels', caption: 'Legenda nova',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const whenA = brtToIso(dayA, '10:30');
  let post = await row(`SELECT * FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskA]);
  assert.ok(post, 'post automático criado');
  assert.equal(post.scheduled_at.toISOString(), whenA);
  assert.equal(post.platform, 'instagram');
  assert.equal(post.publish_type, 'reels');
  assert.equal(post.caption, 'Legenda nova');
  assert.equal(post.media_url, MEDIA('video.mp4'));
  let task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskA]);
  assert.equal(task.posting_at.toISOString(), whenA);
  assert.equal(task.kanban_column, 'acompanhamento');
  assert.equal(task.scheduled_recording_date, dayA);
  assert.equal(task.scheduled_recording_time, '10:30');
  let delivery = await row(`SELECT * FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskA]);
  assert.equal(delivery.status, 'agendado');
  assert.equal(delivery.posted_at, dayA);
  assert.equal(delivery.scheduled_time, '10:30');
  assert.equal(delivery.city, 'minacu');
  assert.equal(post.delivery_id, delivery.id, 'post ligado à entrega (o Social vê a postagem automática)');
  const hist = await row(`SELECT * FROM task_history WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.taskA]);
  assert.equal(hist.action, 'Agendado para Postagem');
  assert.doesNotMatch(hist.details, /\bIA\b|rob[oô]/i);
  r = await materials(ids.cliMin);
  const schedA = r.json.scheduled.find((i) => i.key === `conteudo:${ids.taskA}`);
  assert.equal(schedA.state, 'agendado');
  assert.equal(schedA.mode, 'auto');
  assert.equal(schedA.when.time, '10:30');
  assert.ok(!r.json.unscheduled.some((i) => i.key === `conteudo:${ids.taskA}`));
  assert.equal((await row(`SELECT status FROM client_portal_contents WHERE id = $1`, [ids.portalA])).status, 'aprovado', 'portal ligado ao card fica aprovado');
  ok('agendar com conta: cria o post na fila, grava a data no card, na entrega e move para Acompanhamento');

  // Repetir não duplica: o pendente anterior sai
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: dayA, time: '10:30',
    mode: 'auto', platform: 'instagram', publish_type: 'reels', caption: 'Legenda nova',
  });
  assert.equal(r.status, 200);
  const activeCount = await row(`SELECT count(*)::int AS n FROM scheduled_posts WHERE content_task_id = $1 AND status IN ('agendado','erro','publicando')`, [ids.taskA]);
  assert.equal(activeCount.n, 1);
  ok('agendar de novo deixa um post só na fila');

  // ── Agendar sem conta: só a data ──
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskB, date: dayA, time: '09:00', mode: 'auto', platform: 'instagram', publish_type: 'reels' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /sem conta conectada/i);
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskB, date: dayA, time: '09:00', mode: 'manual', platform: 'instagram' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await row(`SELECT count(*)::int AS n FROM scheduled_posts WHERE content_task_id = $1`, [ids.taskB])).n, 0);
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskB]);
  assert.equal(task.posting_at.toISOString(), brtToIso(dayA, '09:00'));
  assert.equal(task.kanban_column, 'acompanhamento');
  r = await materials(ids.cliNoAcc);
  const schedB = r.json.scheduled.find((i) => i.key === `conteudo:${ids.taskB}`);
  assert.equal(schedB.state, 'manual');
  ok('agendar sem conta: grava só a data (item "manual" no calendário), sem post na fila');

  // ── Remarcar: arrastar mantém a hora ──
  const dayA2 = addDays(today, 5);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: dayA2 });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  post = await row(`SELECT * FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskA]);
  assert.equal(post.scheduled_at.toISOString(), brtToIso(dayA2, '10:30'));
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskA]);
  assert.equal(task.posting_at.toISOString(), brtToIso(dayA2, '10:30'));
  assert.equal(task.scheduled_recording_date, dayA2);
  delivery = await row(`SELECT * FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskA]);
  assert.equal(delivery.posted_at, dayA2);
  assert.equal(delivery.scheduled_time, '10:30');
  ok('remarcar a data mantém a hora (post, card e entrega juntos)');

  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: dayA2, time: '15:45' });
  assert.equal(r.status, 200);
  post = await row(`SELECT * FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskA]);
  assert.equal(post.scheduled_at.toISOString(), brtToIso(dayA2, '15:45'));
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskA]);
  assert.equal(task.posting_at.toISOString(), brtToIso(dayA2, '15:45'));
  ok('mudar a hora');

  // Passado: automático recusa; manual pede confirmação
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA, date: addDays(today, -1) });
  assert.equal(r.status, 400);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskB, date: addDays(today, -1) });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'past_date');
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskB, date: addDays(today, -1), allow_past: true });
  assert.equal(r.status, 200);
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskB]);
  assert.equal(task.posting_at.toISOString(), brtToIso(addDays(today, -1), '09:00'));
  ok('data no passado: automático recusa, manual só com confirmação');

  // Item legado sem hora pede a hora
  await pool.query(`UPDATE social_media_deliveries SET scheduled_time = NULL WHERE content_task_id = $1`, [ids.taskLegacy]);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskLegacy, date: addDays(today, 4) });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'time_required');
  ok('item sem hora gravada: remarcar pede a hora em vez de inventar uma');

  // ── Gatilhos: as outras telas mudam a data e o card acompanha ──
  await pool.query(`UPDATE social_media_deliveries SET posted_at = $2, scheduled_time = '08:15' WHERE content_task_id = $1`, [ids.taskB, addDays(today, 6)]);
  task = await row(`SELECT posting_at FROM content_tasks WHERE id = $1`, [ids.taskB]);
  assert.equal(task.posting_at.toISOString(), brtToIso(addDays(today, 6), '08:15'));
  await pool.query(`UPDATE content_tasks SET scheduled_recording_date = $2, scheduled_recording_time = '19:00' WHERE id = $1`, [ids.taskB, addDays(today, 7)]);
  task = await row(`SELECT posting_at FROM content_tasks WHERE id = $1`, [ids.taskB]);
  assert.equal(task.posting_at.toISOString(), brtToIso(addDays(today, 7), '19:00'));
  ok('Entregas Social e Kanban de Conteúdo mudando a data atualizam a data de postagem do card');

  // ── Arte: agendar, cancelar ──
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'arte', id: ids.design, date: dayA, time: '12:00',
    mode: 'auto', platform: 'instagram', publish_type: 'feed', caption: 'Promo',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  post = await row(`SELECT * FROM scheduled_posts WHERE design_task_id = $1 AND status = 'agendado'`, [ids.design]);
  assert.ok(post);
  assert.equal(post.media_url, MEDIA('arte.png'));
  let design = await row(`SELECT * FROM design_tasks WHERE id = $1`, [ids.design]);
  assert.equal(design.posting_at.toISOString(), brtToIso(dayA, '12:00'));
  assert.equal(design.kanban_column, 'aprovado');
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'arte', id: ids.design });
  assert.equal(r.status, 200);
  post = await row(`SELECT * FROM scheduled_posts WHERE id = $1`, [post.id]);
  assert.equal(post.status, 'cancelado');
  design = await row(`SELECT * FROM design_tasks WHERE id = $1`, [ids.design]);
  assert.equal(design.posting_at, null);
  r = await materials(ids.cliMin);
  assert.ok(r.json.unscheduled.some((i) => i.key === `arte:${ids.design}`), 'arte volta para não agendados');
  assert.ok(r.json.scheduled.some((i) => i.key.startsWith(`arte:${ids.design}:cancelado`) && i.state === 'cancelado'), 'selo de cancelado no dia');
  ok('arte: agendar cria o post com a imagem; cancelar tira da fila e volta para não agendados');

  // ── Arte trocada depois de agendada: o post (cópia da URL antiga) sai e ela volta para não agendados ──
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'arte', id: ids.design3, date: dayA, time: '16:00',
    mode: 'auto', platform: 'instagram', publish_type: 'feed', caption: 'Troca',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const postTroca = await row(`SELECT id, media_url FROM scheduled_posts WHERE design_task_id = $1 AND status = 'agendado'`, [ids.design3]);
  assert.equal(postTroca.media_url, MEDIA('troca.png'));
  await pool.query(`UPDATE design_tasks SET observations = 'só texto' WHERE id = $1`, [ids.design3]);
  assert.equal((await row(`SELECT status FROM scheduled_posts WHERE id = $1`, [postTroca.id])).status, 'agendado', 'mexer em outro campo não cancela');
  await pool.query(`UPDATE design_tasks SET attachment_url = $2 WHERE id = $1`, [ids.design3, MEDIA('troca-v2.png')]);
  const trocado = await row(`SELECT status, last_error FROM scheduled_posts WHERE id = $1`, [postTroca.id]);
  assert.equal(trocado.status, 'cancelado');
  assert.equal(trocado.last_error, 'Cancelado: a arte foi trocada depois do agendamento. Agende de novo.');
  assert.equal((await row(`SELECT posting_at FROM design_tasks WHERE id = $1`, [ids.design3])).posting_at, null);
  r = await materials(ids.cliMin);
  assert.ok(r.json.unscheduled.some((i) => i.key === `arte:${ids.design3}` && i.media_url === MEDIA('troca-v2.png')));
  ok('arte trocada depois de agendada: post cancelado e a arte volta para não agendados com a imagem nova');

  // ── Arte agendada levada para Postadas antes da hora (envio em massa antigo): segue como agendada ──
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'arte', id: ids.design4, date: dayA, time: '17:00',
    mode: 'auto', platform: 'instagram', publish_type: 'feed', caption: 'Cedo',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await pool.query(`UPDATE design_tasks SET kanban_column = 'postado', updated_at = now() - interval '30 days' WHERE id = $1`, [ids.design4]);
  const postCedo = await row(`SELECT id, status FROM scheduled_posts WHERE design_task_id = $1 AND status = 'agendado'`, [ids.design4]);
  assert.ok(postCedo, 'mover para Postadas não cancela o post na hora (o robô confere na publicação)');
  r = await materials(ids.cliMin);
  const cedo = r.json.scheduled.find((i) => i.key === `arte:${ids.design4}`);
  assert.equal(cedo?.state, 'agendado');
  assert.equal(cedo?.locked, false);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'arte', id: ids.design4, date: addDays(today, 6) });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await row(`SELECT scheduled_at FROM scheduled_posts WHERE id = $1`, [postCedo.id])).scheduled_at.toISOString(), brtToIso(addDays(today, 6), '17:00'));
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'arte', id: ids.design4 });
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT status FROM scheduled_posts WHERE id = $1`, [postCedo.id])).status, 'cancelado');
  ok('arte em Postadas com post na fila aparece agendada (não "Publicado"), remarca e cancela');

  // ── Cancelar vídeo ──
  const postA = await row(`SELECT id FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskA]);
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'conteudo', id: ids.taskA });
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT status FROM scheduled_posts WHERE id = $1`, [postA.id])).status, 'cancelado');
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskA]);
  assert.equal(task.kanban_column, 'agendamentos');
  assert.equal(task.posting_at, null);
  delivery = await row(`SELECT * FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskA]);
  assert.equal(delivery.status, 'entregue');
  assert.equal((await row(`SELECT status FROM client_portal_contents WHERE id = $1`, [ids.portalA])).status, 'aprovado');
  ok('cancelar: post cancelado, card volta para Agendamentos e a entrega para Pronto p/ agendar');

  // ── Conteúdo avulso agendado: o cliente não pede ajuste e o portal o trata como aprovado ──
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portalSolo, date: addDays(today, 4), time: '09:00', mode: 'manual' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await row(`SELECT status FROM client_portal_contents WHERE id = $1`, [ids.portalSolo])).status, 'agendado');
  r = await portalAction(ids.cliMin, { action: 'request_adjustment', content_id: ids.portalSolo, message: 'Troca a música' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'Este conteúdo já está agendado/publicado. Fale com a equipe para alterar.');
  r = await portalAction(ids.cliMin, { action: 'approve', content_id: ids.portalSolo });
  assert.equal(r.status, 200);
  assert.equal(r.json.already_approved, true);
  assert.equal((await row(`SELECT status FROM client_portal_contents WHERE id = $1`, [ids.portalSolo])).status, 'agendado');
  assert.equal((await row(`SELECT count(*)::int AS n FROM client_portal_comments WHERE content_id = $1`, [ids.portalSolo])).n, 0);
  r = await portalAction(ids.cliMin, { action: 'request_adjustment', content_id: ids.portalA, message: 'Ajuste no vídeo A' });
  assert.equal(r.status, 200, 'conteúdo ligado ao card (aprovado) segue o fluxo antigo');
  await pool.query(`UPDATE client_portal_contents SET status = 'aprovado' WHERE id = $1`, [ids.portalA]);
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'portal', id: ids.portalSolo });
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT status FROM client_portal_contents WHERE id = $1`, [ids.portalSolo])).status, 'aprovado');
  ok('portal avulso agendado: pedido de ajuste do cliente recusado (409), aprovar não regrava; ligado ao card segue aprovado');

  // ── Publicado não remarca ──
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'portal', id: ids.portal, date: dayA, time: '20:00',
    mode: 'auto', platform: 'instagram', publish_type: 'reels', caption: '',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const postP = await row(`SELECT * FROM scheduled_posts WHERE portal_content_id = $1 AND status = 'agendado'`, [ids.portal]);
  assert.equal((await row(`SELECT posting_at FROM client_portal_contents WHERE id = $1`, [ids.portal])).posting_at.toISOString(), brtToIso(dayA, '20:00'));
  await pool.query(`UPDATE scheduled_posts SET status = 'publicado', published_at = now() WHERE id = $1`, [postP.id]);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portal, date: addDays(today, 8) });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'published');
  r = await api('POST', '/scheduling/cancel', { client_id: ids.cliMin, kind: 'portal', id: ids.portal });
  assert.equal(r.status, 409);
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliMin, kind: 'portal', id: ids.portal, date: addDays(today, 8), time: '10:00', mode: 'manual' });
  assert.equal(r.status, 409);
  r = await materials(ids.cliMin);
  const pubItem = r.json.scheduled.find((i) => i.key === `portal:${ids.portal}`);
  assert.equal(pubItem.state, 'publicado');
  assert.equal(pubItem.locked, true);
  ok('publicado não remarca, não cancela e aparece travado no calendário');

  // ── O robô não publica o que foi cancelado ──
  await pool.query(`UPDATE scheduled_posts SET scheduled_at = now() - interval '2 minutes' WHERE id = $1`, [postA.id]);
  // Post vencido de uma arte que saiu de Aprovado: o gatilho da arte cancela; o robô confere de novo
  await pool.query(`UPDATE design_tasks SET kanban_column = 'ajustes' WHERE id = $1`, [ids.design]);
  const { rows: [due] } = await pool.query(
    `INSERT INTO scheduled_posts (client_id, design_task_id, platform, publish_type, media_url, caption, scheduled_at)
     VALUES ($1, $2, 'instagram', 'feed', $3, '', now() - interval '1 minute') RETURNING id`,
    [ids.cliMin, ids.design, MEDIA('arte.png')]
  );
  // Reforço no robô: post vencido com a URL antiga de uma arte que continua em Aprovado
  const { rows: [dueTroca] } = await pool.query(
    `INSERT INTO scheduled_posts (client_id, design_task_id, platform, publish_type, media_url, caption, scheduled_at)
     VALUES ($1, $2, 'instagram', 'feed', $3, '', now() - interval '1 minute') RETURNING id`,
    [ids.cliMin, ids.design3, MEDIA('troca.png')]
  );
  const robotDone = await waitFor(async () => {
    const p = await row(`SELECT status, last_error FROM scheduled_posts WHERE id = $1`, [due.id]);
    return p.status !== 'agendado' ? p : null;
  }, 'robô passar pelo post vencido', 40_000);
  assert.equal(robotDone.status, 'cancelado');
  assert.match(robotDone.last_error, /arte saiu de Aprovado/);
  const cancelledA = await row(`SELECT status, attempts, published_at FROM scheduled_posts WHERE id = $1`, [postA.id]);
  assert.equal(cancelledA.status, 'cancelado');
  assert.equal(cancelledA.attempts, 0);
  assert.equal(cancelledA.published_at, null);
  const robotTroca = await waitFor(async () => {
    const p = await row(`SELECT status, last_error FROM scheduled_posts WHERE id = $1`, [dueTroca.id]);
    return p.status !== 'agendado' ? p : null;
  }, 'robô passar pelo post da arte trocada', 40_000);
  assert.equal(robotTroca.status, 'cancelado');
  assert.match(robotTroca.last_error, /arte foi trocada depois do agendamento/);
  await pool.query(`UPDATE design_tasks SET posting_at = NULL WHERE id = $1`, [ids.design3]);
  ok('o robô não publica o cancelado e cancela o post da arte que saiu de Aprovado ou foi trocada');

  // Arte que sai de Aprovado com post pendente: o gatilho cancela na hora
  await pool.query(`UPDATE design_tasks SET kanban_column = 'aprovado' WHERE id = $1`, [ids.design]);
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliMin, kind: 'arte', id: ids.design, date: dayA, time: '12:00',
    mode: 'auto', platform: 'instagram', publish_type: 'feed', caption: 'Promo',
  });
  assert.equal(r.status, 200);
  await pool.query(`UPDATE design_tasks SET kanban_column = 'ajustes' WHERE id = $1`, [ids.design]);
  assert.equal((await row(`SELECT count(*)::int AS n FROM scheduled_posts WHERE design_task_id = $1 AND status = 'agendado'`, [ids.design])).n, 0);
  assert.equal((await row(`SELECT posting_at FROM design_tasks WHERE id = $1`, [ids.design])).posting_at, null);
  ok('arte que volta para ajustes perde a data e o post pendente');

  // ── Cidade gravada nos registros novos ──
  r = await api('POST', '/scheduling/schedule', { client_id: ids.cliUru, kind: 'conteudo', id: ids.taskUru, date: dayA, time: '11:00', mode: 'manual', platform: 'instagram' }, { city: 'uruacu' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  delivery = await row(`SELECT city FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskUru]);
  assert.equal(delivery.city, 'uruacu');
  const histUru = await row(`SELECT city FROM task_history WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1`, [ids.taskUru]);
  assert.equal(histUru.city, 'uruacu');
  ok('registros novos ficam na cidade do cliente');

  // ── Estúdio/Entregas seguem iguais ──
  r = await api('POST', '/social-posts', { client_id: ids.cliMin, platform: 'instagram', publish_type: 'xx', media_url: MEDIA('v.mp4'), scheduled_at: brtToIso(dayA, '10:00') });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'publish_type inválido');
  r = await api('POST', '/social-posts', { client_id: ids.cliNoAcc, platform: 'instagram', publish_type: 'reels', media_url: MEDIA('v.mp4'), scheduled_at: brtToIso(dayA, '10:00') });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Cliente sem conta conectada: instagram/);
  r = await api('POST', '/social-posts', { client_id: ids.cliMin, platform: 'instagram', publish_type: 'reels', media_url: MEDIA('v.mp4'), scheduled_at: brtToIso(dayA, '10:00'), caption: 'x' });
  assert.equal(r.status, 200);
  const studio = r.json.post;
  r = await materials(ids.cliMin);
  assert.ok(r.json.scheduled.some((i) => i.key === `post:${studio.id}` && i.state === 'agendado'), 'post do Estúdio aparece no calendário');
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cliMin, kind: 'post', id: studio.id, date: addDays(today, 9) });
  assert.equal(r.status, 200);
  assert.equal((await row(`SELECT scheduled_at FROM scheduled_posts WHERE id = $1`, [studio.id])).scheduled_at.toISOString(), brtToIso(addDays(today, 9), '10:00'));
  r = await api('POST', `/social-posts/${studio.id}/cancel`, {});
  assert.equal(r.status, 200);
  ok('POST /api/social-posts com as mesmas regras e mensagens; post do Estúdio arrasta no calendário');

  console.log('\nTodos os testes de agendamentos passaram.');
} catch (error) {
  console.error('\nFALHOU:', error);
  console.error('\n--- log do servidor (fim) ---\n', serverLog.slice(-4000));
  process.exitCode = 1;
} finally {
  stop();
  await pool.end();
}

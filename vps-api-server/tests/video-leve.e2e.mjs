// Teste de ponta a ponta da versão leve dos vídeos (<nome>.web.mp4).
//
// Gera vídeos de teste com o ffmpeg (H.264 de ~40 Mbps, .mov HEVC sem faststart, um leve e um corrompido),
// sobe o server.mjs contra um Postgres de teste e um UPLOAD_ROOT temporário e confere: conversão depois do
// upload (equipe e portal), vídeo leve sem conversão, falha sem repetir, rota /api/media/playback (equipe,
// token do portal, link avulso, recusas), Range/206 na versão leve, vídeos antigos (os mais novos primeiro,
// um por vez), limpeza diária das versões, DELETE do upload e auditoria de arquivos sem uso.
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_videoleve node tests/video-leve.e2e.mjs
// Sem TEST_DATABASE_URL o teste recria pulse_videoleve a partir de pulse_db (CREATE DATABASE ... TEMPLATE pulse_db).
// Precisa de ffmpeg/ffprobe com libx264 (e libx265 para o .mov HEVC; sem ele usa H.264 em .mov sem faststart).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { mp4HasFaststart, webVariantPath, webVariantUrl } from '../lib/webVideo.mjs';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_NAME = 'pulse_videoleve';
const DB = process.env.TEST_DATABASE_URL || `postgres://postgres:teste@localhost:55432/${DB_NAME}`;
const PORT = Number(process.env.TEST_API_PORT || 5147);
const SECRET = 'segredo-teste-video-leve';
const PORTAL_SECRET = 'segredo-portal-video-leve';
const BASE = `http://127.0.0.1:${PORT}/api`;
const PUBLIC = 'https://agenciapulse.tech/uploads';
const DAY = 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const UPLOAD_ROOT = tmp('video-leve-uploads-');
const WORK = tmp('video-leve-fontes-');
const STATE = tmp('video-leve-estado-');

const ids = {
  admin: '00000000-0000-0000-0000-00000000f001',
  client: '00000000-0000-0000-0000-00000000f101',
  avulso: '00000000-0000-0000-0000-00000000f201',
  task: '00000000-0000-0000-0000-00000000f202',
  agentTask: '00000000-0000-0000-0000-00000000f203',
};

// ── Banco ──────────────────────────────────────────────────────
if (!process.env.TEST_DATABASE_URL) {
  const admin = new pg.Client({ connectionString: 'postgres://postgres:teste@localhost:55432/postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.query(`CREATE DATABASE ${DB_NAME} TEMPLATE pulse_db`);
  await admin.end();
}
const pool = new pg.Pool({ connectionString: DB });

// ── Vídeos de teste ────────────────────────────────────────────
function ffmpeg(args) {
  execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}
function probe(file) {
  const json = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
  const video = json.streams.find((s) => s.codec_type === 'video');
  return {
    codec: video?.codec_name, width: Number(video?.width), height: Number(video?.height), pixFmt: video?.pix_fmt,
    duration: Number(json.format.duration), bitRate: Number(json.format.bit_rate), size: Number(json.format.size),
  };
}
const hasX265 = execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString().includes('libx265');
const src = {
  heavy: path.join(WORK, 'pesado.mp4'), hevc: path.join(WORK, 'hevc.mov'), hevcShort: path.join(WORK, 'hevc-curto.mov'),
  light: path.join(WORK, 'leve.mp4'), broken: path.join(WORK, 'quebrado.mp4'),
};
const hevcArgs = (seconds, out) => [
  '-f', 'lavfi', '-i', `testsrc2=s=1080x1920:r=30:d=${seconds}`, '-f', 'lavfi', '-i', `sine=f=330:d=${seconds}`,
  '-vf', 'noise=alls=15:allf=t',
  ...(hasX265
    ? ['-c:v', 'libx265', '-tag:v', 'hvc1', '-preset', 'ultrafast', '-b:v', '15M', '-x265-params', 'log-level=error']
    : ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '15M']),
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out, // .mov sem +faststart: moov no fim
];
// H.264 1080x1920 de ~40 Mbps com faststart (CBR com preenchimento, como os .mp4 de 33 a 44 Mbps)
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=8', '-f', 'lavfi', '-i', 'sine=f=440:d=8',
  '-vf', 'noise=alls=20:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '40M', '-minrate', '40M', '-maxrate', '40M',
  '-bufsize', '20M', '-x264-params', 'nal-hrd=cbr:filler=1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart', src.heavy]);
ffmpeg(hevcArgs(5, src.hevc));
ffmpeg(hevcArgs(3, src.hevcShort));
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=550:d=4',
  '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2M', '-maxrate', '2M', '-bufsize', '4M', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', src.light]);
fs.writeFileSync(src.broken, crypto.randomBytes(300_000));
const heavyInfo = probe(src.heavy);
const hevcInfo = probe(src.hevc);
assert.ok(heavyInfo.bitRate > 33e6, `fonte pesada com ${heavyInfo.bitRate}`);
assert.equal(mp4HasFaststart(src.heavy), true);
assert.equal(mp4HasFaststart(src.hevc), false, 'o .mov de teste precisa estar sem faststart');
ok(`vídeos de teste: H.264 ${(heavyInfo.bitRate / 1e6).toFixed(1)} Mbps, .mov ${hevcInfo.codec} sem faststart, leve ${(probe(src.light).bitRate / 1e6).toFixed(1)} Mbps`);

// ── Arquivos e linhas que já existiam antes da subida ──────────
let nameSeq = 0;
function place(source, folder, ext, ageDays) {
  nameSeq += 1;
  const name = `${1761000000000 + nameSeq}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const rel = `${folder}/${name}`;
  const full = path.join(UPLOAD_ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.copyFileSync(source, full);
  const when = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(full, when, when);
  return { rel, full, url: `${PUBLIC}/${rel}`, web: webVariantPath(full) };
}
const cfolder = (n) => `content/${ids.client}/0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const recent1 = place(src.hevcShort, cfolder(1), '.mov', 1);
const recent2 = place(src.hevcShort, cfolder(2), '.mov', 3);
const old = place(src.hevcShort, cfolder(3), '.mov', 20);
// versões de edição: 3 versões do mesmo card; a limpeza diária mantém as 2 últimas
const versions = [1, 2, 3].map(() => place(src.light, `content/${ids.client}/${ids.task}`, '.mp4', 3));
for (const v of versions) fs.copyFileSync(src.light, v.web); // versão leve já existente ao lado do original
const orphanWeb = path.join(UPLOAD_ROOT, `content/${ids.client}/sem-original/1761999999999_deadbeefcafe.web.mp4`);
fs.mkdirSync(path.dirname(orphanWeb), { recursive: true });
fs.copyFileSync(src.light, orphanWeb);
const symlinkFile = path.join(UPLOAD_ROOT, 'content', 'atalho-para-fora.mp4');
fs.symlinkSync(src.heavy, symlinkFile);

const USERS = [ids.admin];
await pool.query(`DELETE FROM edit_versions WHERE task_id = ANY($1)`, [[ids.task, ids.avulso]]).catch(() => {});
await pool.query(`DELETE FROM content_tasks WHERE id = ANY($1)`, [[ids.task, ids.avulso, ids.agentTask]]);
await pool.query(`DELETE FROM client_portal_contents WHERE client_id = $1`, [ids.client]);
await pool.query(`DELETE FROM clients WHERE id = $1`, [ids.client]);
await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [USERS]);
await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [USERS]);
await pool.query(`INSERT INTO profiles (id, name, email, role) VALUES ($1, 'Admin Vídeo', 'admin-video@teste.local', 'admin')`, USERS);
await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, USERS);
await pool.query(`INSERT INTO clients (id, company_name, city, status) VALUES ($1, 'Clínica Vídeo', 'minacu', 'ativo')`, [ids.client]);
const contentRow = (file, ageDays, title) => pool.query(
  `INSERT INTO client_portal_contents (client_id, title, content_type, season_month, season_year, file_url, status, created_at)
   VALUES ($1, $2, 'reels', 10, 2026, $3, 'pendente', now() - make_interval(days => $4::int))`,
  [ids.client, title, file.url, ageDays]
);
await contentRow(recent1, 1, 'Recente 1');
await contentRow(recent2, 3, 'Recente 2');
await contentRow(old, 2, 'Antigo (arquivo de 20 dias)');
await pool.query(
  `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link, created_at, updated_at)
   VALUES ($1, $2, 'Card com versões', 'reels', 'edicao', $3, now() - interval '3 days', now() - interval '3 days')`,
  [ids.task, ids.client, versions[2].url]
);
for (const [i, v] of versions.entries()) {
  await pool.query(
    `INSERT INTO edit_versions (task_id, version, video_url, created_at) VALUES ($1, $2, $3, now() - interval '3 days')`,
    [ids.task, i + 1, v.url]
  );
}
await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB, PRIMARY KEY (job, day))`);
await pool.query(`DELETE FROM pulse_job_runs WHERE job = 'limpeza_versoes_video_v2'`);

// ── Sobe o servidor ────────────────────────────────────────────
const server = spawn('node', [path.join(API_DIR, 'server.mjs')], {
  cwd: API_DIR,
  env: {
    ...process.env, DATABASE_URL: DB, JWT_SECRET: SECRET, PORTAL_JWT_SECRET: PORTAL_SECRET, API_PORT: String(PORT),
    UPLOAD_ROOT, GOOGLE_GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '',
    WEB_VIDEO_PAUSE_MS: '0', WEB_VIDEO_BACKFILL_DELAY_MS: '1500', WEB_VIDEO_BACKFILL_INTERVAL_MS: '0',
    WEB_VIDEO_STATE_DIR: STATE, WEB_VIDEO_MIN_FREE_BYTES: '0', WEB_VIDEO_MIN_FREE_RATIO: '0',
    VERSION_CLEANUP_DELAY_MS: '4000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
process.on('uncaughtException', (error) => {
  console.error(error);
  console.error('--- log do servidor (fim) ---\n' + serverLog.split('\n').filter((l) => /video-leve|limpeza|upload|Error|error/i.test(l)).slice(-60).join('\n'));
  stop();
  process.exit(1);
});
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  try { if ((await fetch(`${BASE}/health`)).ok) break; } catch {}
  if (i === 59) throw new Error(`servidor não subiu:\n${serverLog.slice(-3000)}`);
}

async function waitFor(fn, label, timeout = 120_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`tempo esgotado: ${label}`);
    await sleep(300);
  }
}
const logLines = () => serverLog.split('\n').filter((l) => l.includes('[video-leve]'));

const team = jwt.sign({ sub: ids.admin, email: 'admin-video@teste.local', role: 'admin' }, SECRET, { expiresIn: '1h' });
const portal = jwt.sign({ typ: 'portal', cid: ids.client, puid: null }, PORTAL_SECRET, { expiresIn: '1h' });
const asTeam = { Authorization: `Bearer ${team}` };
const asClient = { 'x-portal-token': portal };

let res;
async function upload(file, folder, headers = asTeam, name = path.basename(file)) {
  const form = new FormData();
  form.append('folder', folder);
  form.append('file', new Blob([fs.readFileSync(file)], { type: name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4' }), name);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: form });
  const body = await res.json();
  assert.equal(res.status, 200, `upload ${name}: ${JSON.stringify(body)}`);
  const full = path.join(UPLOAD_ROOT, body.path);
  return { url: body.url, rel: body.path, full, web: webVariantPath(full) };
}
async function playback(url, headers = asTeam, extra = '') {
  const res = await fetch(`${BASE}/media/playback?url=${encodeURIComponent(url)}${extra}`, { headers });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── 1. Vídeos antigos: os dos últimos 14 dias, do mais novo para o mais antigo, um por vez ──
// O arquivo aparece (rename) um instante antes da linha "pronto:" no log: espera os dois
await waitFor(() => fs.existsSync(recent1.web) && fs.existsSync(recent2.web)
  && logLines().filter((l) => l.includes('pronto:')).length >= 2, 'versão leve dos vídeos recentes');
assert.equal(fs.existsSync(old.web), false, 'arquivo de 20 dias não entra na tarefa de fundo');
const doneOrder = logLines().filter((l) => l.includes('pronto:')).map((l) => (l.includes(recent1.rel) ? 'r1' : l.includes(recent2.rel) ? 'r2' : '?'));
assert.deepEqual(doneOrder.slice(0, 2), ['r1', 'r2'], `ordem: ${doneOrder}`);
assert.ok(logLines().some((l) => /sem versão leve: 2\b/.test(l)), 'log com quantos faltam no começo');
assert.ok(logLines().some((l) => /faltam 0 vídeo/.test(l)), 'log com quantos faltam ao fim');
for (const f of [recent1, recent2]) {
  const info = probe(f.web);
  assert.equal(info.codec, 'h264');
  assert.equal(mp4HasFaststart(f.web), true);
}
ok('tarefa de fundo: 2 vídeos recentes convertidos (o mais novo primeiro), o de 20 dias ficou de fora');

// ── 2. Upload de vídeo pesado (equipe) ──
const heavy = await upload(src.heavy, `content/${ids.client}/upload-pesado`);
await waitFor(() => fs.existsSync(heavy.web), 'versão leve do upload pesado', 120_000);
const heavyWeb = probe(heavy.web);
assert.equal(heavyWeb.codec, 'h264');
assert.equal(heavyWeb.pixFmt, 'yuv420p');
assert.equal(`${heavyWeb.width}x${heavyWeb.height}`, '1080x1920', 'vertical 1080x1920 fica igual');
assert.ok(heavyWeb.bitRate <= 7_000_000, `taxa da versão leve ${heavyWeb.bitRate}`);
assert.ok(Math.abs(heavyWeb.duration - heavyInfo.duration) < 0.3, `duração ${heavyWeb.duration} x ${heavyInfo.duration}`);
assert.equal(mp4HasFaststart(heavy.web), true);
assert.equal(fs.statSync(heavy.full).size, fs.statSync(src.heavy).size, 'original intacto');
ok(`upload pesado: ${(heavyInfo.bitRate / 1e6).toFixed(1)} Mbps (${(heavyInfo.size / 1048576).toFixed(1)} MB) → ${(heavyWeb.bitRate / 1e6).toFixed(1)} Mbps (${(heavyWeb.size / 1048576).toFixed(1)} MB), H.264, faststart, mesma duração`);

// ── 3. .mov HEVC sem faststart vira .web.mp4 H.264 ──
const hevc = await upload(src.hevc, `content/${ids.client}/upload-hevc`);
await waitFor(() => fs.existsSync(hevc.web), 'versão leve do .mov');
const hevcWeb = probe(hevc.web);
assert.equal(hevcWeb.codec, 'h264');
assert.equal(mp4HasFaststart(hevc.web), true);
assert.ok(Math.abs(hevcWeb.duration - hevcInfo.duration) < 0.3);
assert.ok(hevc.web.endsWith('.web.mp4'));
ok(`.mov ${hevcInfo.codec} ${(hevcInfo.bitRate / 1e6).toFixed(1)} Mbps sem faststart → .web.mp4 H.264 ${(hevcWeb.bitRate / 1e6).toFixed(1)} Mbps com faststart`);

// ── 4. Vídeo leve não é convertido ──
const light = await upload(src.light, `content/${ids.client}/upload-leve`);
await waitFor(() => logLines().some((l) => l.includes('sem conversão') && l.includes(light.rel)), 'decisão do vídeo leve');
assert.equal(fs.existsSync(light.web), false);
ok('vídeo leve (H.264 2 Mbps, faststart, .mp4) não ganha cópia');

// ── 5. Upload do portal sem login (panfletagem) também entra na fila ──
const portalUpload = await upload(src.hevcShort, `panfletagem/${ids.client}`, {}, 'carro.mov');
await waitFor(() => fs.existsSync(portalUpload.web), 'versão leve do upload do portal');
ok('upload do portal (sem login da equipe) também gera a versão leve');

// ── 5b. Entrega do agente (/api/agent/tasks/:id/deliver) também entra na fila ──
await fetch(`${BASE}/agent/me`, { headers: { Authorization: 'Agent pa_cria-o-esquema' } }); // cria as tabelas dos agentes
const agentKey = `pa_${crypto.randomBytes(24).toString('base64url')}`;
await pool.query(`DELETE FROM agent_keys WHERE user_id = $1`, [ids.admin]);
await pool.query(
  `INSERT INTO agent_keys (user_id, role, key_hash, key_hint, created_by) VALUES ($1, 'editor', $2, $3, $1)`,
  [ids.admin, crypto.createHash('sha256').update(agentKey).digest('hex'), agentKey.slice(-4)]
);
await pool.query(
  `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, assigned_to) VALUES ($1, $2, 'Entrega do agente', 'reels', 'edicao', $3)`,
  [ids.agentTask, ids.client, ids.admin]
);
const agentForm = new FormData();
agentForm.append('video', new Blob([fs.readFileSync(src.hevcShort)], { type: 'video/quicktime' }), 'final.mov');
agentForm.append('notes', 'v1');
res = await fetch(`${BASE}/agent/tasks/${ids.agentTask}/deliver`, { method: 'POST', headers: { Authorization: `Agent ${agentKey}` }, body: agentForm });
const delivered = await res.json();
assert.equal(res.status, 200, JSON.stringify(delivered));
const deliveredFull = path.join(UPLOAD_ROOT, delivered.video_url.replace(`${PUBLIC}/`, ''));
await waitFor(() => fs.existsSync(webVariantPath(deliveredFull)), 'versão leve da entrega do agente');
assert.equal(probe(webVariantPath(deliveredFull)).codec, 'h264');
const { rows: [taskRow] } = await pool.query(`SELECT edited_video_link FROM content_tasks WHERE id = $1`, [ids.agentTask]);
assert.equal(taskRow.edited_video_link, delivered.video_url, 'a URL gravada no banco continua a do original');
ok('entrega do agente (/api/agent/tasks/:id/deliver) gera a versão leve; o banco guarda o original');

// ── 6. Arquivo quebrado: falha uma vez e não tenta de novo ──
const broken = await upload(src.broken, `content/${ids.client}/upload-quebrado`);
await waitFor(() => logLines().some((l) => l.includes('falhou') && l.includes(broken.rel)), 'falha do arquivo quebrado');
assert.equal((await playback(broken.url)).body.variant, 'original');
await sleep(1500);
assert.equal(logLines().filter((l) => l.includes(broken.rel) && /falhou|convertendo|na fila/.test(l) && !l.includes('upload)')).length, 1,
  'o arquivo que falhou não volta para a fila');
assert.equal(fs.readdirSync(path.join(UPLOAD_ROOT, '.web-tmp')).length, 0, 'sem temporário largado');
ok('conversão que falha fica registrada no log e não repete');

// ── 7. Rota de reprodução ──
let r = await playback(heavy.url);
assert.equal(r.status, 200);
assert.deepEqual(r.body, { url: webVariantUrl(heavy.url), variant: 'web' });
assert.ok(r.body.url.startsWith(`${PUBLIC}/content/`) && r.body.url.endsWith('.web.mp4'));
r = await playback(heavy.url, asClient);
assert.equal(r.status, 200);
assert.equal(r.body.variant, 'web');
r = await playback(`/uploads/${heavy.rel}`, asClient);
assert.deepEqual(r.body, { url: `/uploads/${heavy.rel.replace(/\.mp4$/, '.web.mp4')}`, variant: 'web' }, 'URL relativa devolve relativa');
r = await playback(light.url);
assert.deepEqual(r.body, { url: light.url, variant: 'original' }, 'leve: o original é a versão de assistir');
assert.equal((await playback(heavy.url, {})).status, 401, 'sem login');
assert.equal((await playback(heavy.url, { Authorization: 'Bearer token-invalido' })).status, 401, 'token inválido');
assert.equal((await playback(heavy.url, { 'x-portal-token': jwt.sign({ typ: 'portal', cid: ids.client }, 'outro-segredo') })).status, 401, 'token do portal falso');
for (const bad of [
  `${PUBLIC}/content/..%2f..%2f.env`,
  `/uploads/content/..%2F..%2Fetc/passwd`,
  `/uploads/..%5c..%5cetc/passwd`,
  `${PUBLIC}/content/%2e%2e/%2e%2e/etc/passwd`,
  'https://agenciapulse.tech/api/health',
  'https://outro-site.com/uploads/content/x.mp4',
  '/etc/passwd',
  'file:///etc/passwd',
  `${PUBLIC}/training-videos/aula.mp4`,
  `${PUBLIC}/.web-tmp/x.mp4`,
]) {
  r = await playback(bad);
  assert.equal(r.status, 400, `devia recusar ${bad}: ${r.status} ${JSON.stringify(r.body)}`);
}
r = await playback(`${PUBLIC}/content/atalho-para-fora.mp4`);
assert.equal(r.status, 404, 'atalho que aponta para fora das raízes não é aberto');
r = await playback(`${PUBLIC}/content/${ids.client}/nao-existe.mp4`);
assert.equal(r.status, 404);
// lote (cards do portal)
res = await fetch(`${BASE}/media/playback`, {
  method: 'POST', headers: { ...asClient, 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls: [heavy.url, light.url, '/etc/passwd'] }),
});
let batch = await res.json();
assert.equal(res.status, 200);
assert.deepEqual(batch.items.map((i) => i.variant || i.error), ['web', 'original', 'URL não permitida']);
assert.equal((await fetch(`${BASE}/media/playback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: [heavy.url] }) })).status, 401);
// link avulso: só o vídeo daquele card
await pool.query(
  `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link) VALUES ($1, NULL, 'Avulso', 'reels', 'revisao', $2)`,
  [ids.avulso, heavy.url]
);
r = await playback(heavy.url, {}, `&avulso=${ids.avulso}`);
assert.deepEqual(r.body, { url: webVariantUrl(heavy.url), variant: 'web' });
assert.equal((await playback(hevc.url, {}, `&avulso=${ids.avulso}`)).status, 400, 'avulso não abre outro vídeo');
assert.equal((await playback(heavy.url, {}, `&avulso=${ids.task}`)).status, 401, 'card com cliente não vale como avulso');
ok('rota /api/media/playback: equipe, token do portal, lote e link avulso; recusa sem login, "..", fora de /uploads, treinamento e atalho');

// ── 8. Range/206 na versão leve ──
const webUrl = webVariantUrl(heavy.url);
const webSize = fs.statSync(heavy.web).size;
res = await fetch(`${BASE}/portal-media-proxy?url=${encodeURIComponent(webUrl)}`, { headers: { Range: 'bytes=0-1023' } });
let buf = Buffer.from(await res.arrayBuffer());
assert.equal(res.status, 206);
assert.equal(res.headers.get('content-range'), `bytes 0-1023/${webSize}`);
assert.equal(res.headers.get('content-type'), 'video/mp4');
assert.equal(buf.length, 1024);
assert.equal(buf.toString('latin1', 4, 8), 'ftyp');
res = await fetch(`${BASE}/portal-media-proxy?url=${encodeURIComponent(webUrl)}`, { headers: { Range: `bytes=${webSize - 500}-` } });
buf = Buffer.from(await res.arrayBuffer());
assert.equal(res.status, 206);
assert.equal(buf.length, 500);
assert.deepEqual(buf, fs.readFileSync(heavy.web).subarray(webSize - 500));
ok('Range/206 na versão leve (começo e fim do arquivo)');

// ── 9. Vídeo recente sem versão leve: quem assiste põe na fila ──
const direct = place(src.hevcShort, `content/${ids.client}/copiado-direto`, '.mov', 0);
r = await playback(direct.url, asClient);
assert.deepEqual(r.body, { url: direct.url, variant: 'original' }, 'enquanto converte, o original');
await waitFor(() => fs.existsSync(direct.web), 'versão leve pedida ao assistir');
r = await playback(direct.url, asClient);
assert.equal(r.body.variant, 'web');
ok('vídeo recente sem versão leve entra na fila quando alguém assiste');

// ── 10. Uma conversão por vez em todo o teste ──
let active = 0;
let maxActive = 0;
for (const line of logLines()) {
  if (line.includes('convertendo:')) { active += 1; maxActive = Math.max(maxActive, active); }
  if (/pronto:|falhou|descartado/.test(line) && active > 0) active -= 1;
}
assert.equal(maxActive, 1, 'nunca duas conversões ao mesmo tempo');
ok('uma conversão por vez');

// ── 11. Limpeza diária das versões: a .web.mp4 sai junto com o original ──
await waitFor(async () => (await pool.query(`SELECT 1 FROM pulse_job_runs WHERE job = 'limpeza_versoes_video_v2' AND result IS NOT NULL`)).rowCount, 'limpeza diária', 60_000);
assert.equal(fs.existsSync(versions[0].full), false, 'versão 1 apagada');
assert.equal(fs.existsSync(versions[0].web), false, 'versão leve da versão 1 apagada junto');
for (const v of versions.slice(1)) {
  assert.ok(fs.existsSync(v.full) && fs.existsSync(v.web), 'versões 2 e 3 ficam com a versão leve');
}
const { rows: logRows } = await pool.query(`SELECT bytes FROM upload_cleanup_log WHERE task_id = $1`, [ids.task]);
assert.equal(logRows.length, 1);
assert.equal(Number(logRows[0].bytes), fs.statSync(src.light).size * 2, 'bytes do original + versão leve');
ok('limpeza diária apaga a .web.mp4 junto com a versão antiga');

// ── 12. Auditoria de arquivos sem uso ──
res = await fetch(`${BASE}/portal-videos/orphan-audit?minAgeDays=0`, { headers: asTeam });
const audit = await res.json();
assert.equal(res.status, 200, JSON.stringify(audit));
const listed = new Set(audit.files.map((f) => f.path));
assert.ok(!listed.has(path.relative(UPLOAD_ROOT, heavy.web)), '.web.mp4 com original não conta como sem uso');
assert.ok(!listed.has(path.relative(UPLOAD_ROOT, recent1.web)));
assert.ok(listed.has(direct.rel) && !listed.has(path.relative(UPLOAD_ROOT, direct.web)), 'original sem uso aparece; a .web.mp4 dele não aparece sozinha');
assert.ok(listed.has(path.relative(UPLOAD_ROOT, orphanWeb)), '.web.mp4 sem original conta como sem uso');
assert.ok(![...listed].some((p) => p.startsWith('.web-tmp/')));
// apagar o original pela auditoria leva a versão leve junto
res = await fetch(`${BASE}/portal-videos/delete-orphans`, {
  method: 'POST', headers: { ...asTeam, 'Content-Type': 'application/json' },
  body: JSON.stringify({ paths: [hevc.rel], minAgeDays: 0 }),
});
const deleted = await res.json();
assert.equal(res.status, 200, JSON.stringify(deleted));
assert.equal(deleted.deletedFiles, 1);
assert.equal(fs.existsSync(hevc.full), false);
assert.equal(fs.existsSync(hevc.web), false, 'versão leve sai junto na remoção de órfãos');
ok('auditoria: .web.mp4 com original fica protegida; sem original aparece; remoção leva as duas');

// ── 13. DELETE /api/upload apaga a versão leve junto ──
res = await fetch(`${BASE}/upload`, {
  method: 'DELETE', headers: { ...asTeam, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: heavy.url }),
});
assert.equal(res.status, 200);
assert.equal(fs.existsSync(heavy.full), false);
assert.equal(fs.existsSync(heavy.web), false);
ok('DELETE /api/upload apaga o original e a versão leve');

console.log('\nRESUMO DE TAMANHOS');
console.log(`  pesado: ${(heavyInfo.size / 1048576).toFixed(1)} MB a ${(heavyInfo.bitRate / 1e6).toFixed(1)} Mbps → ${(heavyWeb.size / 1048576).toFixed(1)} MB a ${(heavyWeb.bitRate / 1e6).toFixed(1)} Mbps`);
console.log(`  .mov ${hevcInfo.codec}: ${(hevcInfo.size / 1048576).toFixed(1)} MB a ${(hevcInfo.bitRate / 1e6).toFixed(1)} Mbps → ${(hevcWeb.size / 1048576).toFixed(1)} MB a ${(hevcWeb.bitRate / 1e6).toFixed(1)} Mbps`);
stop();
await pool.end();
for (const dir of [UPLOAD_ROOT, WORK, STATE]) fs.rmSync(dir, { recursive: true, force: true });
console.log('\nOK: versão leve dos vídeos de ponta a ponta');
process.exit(0);

// Teste de ponta a ponta da versão Instagram dos vídeos (<nome>.ig.mp4) e do robô de postagem.
//
// Gera vídeos de teste com o ffmpeg (H.264 de ~40 Mbps, H.264 de 12 Mbps que cumpre a especificação,
// .mov HEVC sem faststart, story de 70 s, reels de 2 s), sobe o server.mjs com uma Meta falsa
// (tests/helpers/meta-falsa.mjs, carregada com node --import: nenhuma chamada sai para a Meta) contra um
// Postgres de teste e um UPLOAD_ROOT temporário, e confere:
// - post na hora sem a .ig.mp4 pronta: adiado sem erro e publicado depois com a .ig.mp4;
// - 30 min de atraso: vai o original e, com a Meta recusando, o post fica 'erro' com o motivo;
// - story de 70 s e reels de 2 s recusados ao agendar;
// - reels com original de 40 Mbps: a tarefa gera a .ig.mp4 dentro da especificação e o robô usa a .ig.mp4;
// - original que cumpre: vai o original e nada é convertido;
// - a fila da versão leve e a da versão Instagram não se misturam; uma conversão por vez;
// - limpeza diária, DELETE do upload e auditoria de órfãos apagam a .ig.mp4 junto com o original.
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_videoig node tests/video-instagram.e2e.mjs
// Sem TEST_DATABASE_URL o teste recria pulse_videoig a partir de pulse_db (CREATE DATABASE ... TEMPLATE pulse_db).
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
import { mp4HasFaststart, webVariantPath, igVariantPath, igVariantUrl } from '../lib/webVideo.mjs';
import { checkMetaSpec, inspectMp4Container } from '../lib/instagramVideo.mjs';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_NAME = 'pulse_videoig';
const DB = process.env.TEST_DATABASE_URL || `postgres://postgres:teste@localhost:55432/${DB_NAME}`;
const PORT = Number(process.env.TEST_API_PORT || 5347);
const SECRET = 'segredo-teste-video-instagram';
const BASE = `http://127.0.0.1:${PORT}/api`;
// Origem das mídias de teste: só a Meta falsa responde por ela (nunca a produção)
const MEDIA_ORIGIN = 'https://midia.pulse-teste.invalid';
const PUBLIC = `${MEDIA_ORIGIN}/uploads`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

const UPLOAD_ROOT = tmp('video-ig-uploads-');
const WORK = tmp('video-ig-fontes-');
const STATE = tmp('video-ig-estado-');
const META_LOG = path.join(tmp('video-ig-meta-'), 'chamadas.jsonl');

const ids = {
  admin: '00000000-0000-0000-0000-0000000e1001',
  client: '00000000-0000-0000-0000-0000000e1101',
  task: '00000000-0000-0000-0000-0000000e1201',
};

// ── Banco ──────────────────────────────────────────────────────
if (!process.env.TEST_DATABASE_URL) {
  const admin = new pg.Client({ connectionString: 'postgres://postgres:teste@localhost:55432/postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.query(`CREATE DATABASE ${DB_NAME} TEMPLATE pulse_db`);
  await admin.end();
}
assert.ok(/@(localhost|127\.0\.0\.1):55432\//.test(DB), 'o teste só roda no Postgres de teste (localhost:55432)');
const pool = new pg.Pool({ connectionString: DB });

// ── Vídeos de teste ────────────────────────────────────────────
function ffmpeg(args) {
  execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}
function probeJson(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]).toString());
}
function probe(file) {
  const json = probeJson(file);
  const video = json.streams.find((s) => s.codec_type === 'video');
  const audio = json.streams.find((s) => s.codec_type === 'audio');
  return {
    json, codec: video?.codec_name, width: Number(video?.width), height: Number(video?.height), pixFmt: video?.pix_fmt,
    videoBitRate: Number(video?.bit_rate), duration: Number(json.format.duration), bitRate: Number(json.format.bit_rate),
    size: Number(json.format.size), audioCodec: audio?.codec_name, sampleRate: Number(audio?.sample_rate),
    channels: Number(audio?.channels), audioBitRate: Number(audio?.bit_rate),
  };
}
const mbps = (bps) => `${(bps / 1e6).toFixed(1)} Mbps`;
const mb = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;
const hasX265 = execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString().includes('libx265');
const src = {
  heavy: path.join(WORK, 'pesado.mp4'), compliant: path.join(WORK, 'cumpre.mp4'), hevc: path.join(WORK, 'hevc.mov'),
  story70: path.join(WORK, 'story-70s.mp4'), short: path.join(WORK, 'curto-2s.mp4'),
};
// H.264 1080x1920 de ~40 Mbps com faststart (CBR com preenchimento, como os .mp4 de 33 a 44 Mbps)
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=6', '-f', 'lavfi', '-i', 'sine=f=440:d=6',
  '-vf', 'noise=alls=6:allf=t', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '40M', '-minrate', '40M', '-maxrate', '40M',
  '-bufsize', '20M', '-x264-params', 'nal-hrd=cbr:filler=1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
  '-movflags', '+faststart', src.heavy]);
// H.264 de 12 Mbps, faststart, AAC 48 kHz 128k, sem edit list: cumpre a especificação
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=5', '-f', 'lavfi', '-i', 'sine=f=660:d=5',
  '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '12M', '-maxrate', '12M', '-bufsize', '24M', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-use_editlist', '0', src.compliant]);
// .mov HEVC de ~15 Mbps sem faststart (moov no fim), como os do celular
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=5', '-f', 'lavfi', '-i', 'sine=f=330:d=5',
  ...(hasX265
    ? ['-c:v', 'libx265', '-tag:v', 'hvc1', '-preset', 'ultrafast', '-b:v', '15M', '-x265-params', 'log-level=error']
    : ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '15M']),
  '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', src.hevc]);
// story de 70 s e reels de 2 s (pequenos: só a duração importa)
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=70', '-f', 'lavfi', '-i', 'sine=f=220:d=70',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '300k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', src.story70]);
ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=220:d=2',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '300k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', src.short]);

const heavyInfo = probe(src.heavy);
const compliantInfo = probe(src.compliant);
const hevcInfo = probe(src.hevc);
const specOf = (file, kind = 'reels') => {
  const container = inspectMp4Container(file);
  return checkMetaSpec(probeJson(file), { kind, ext: path.extname(file).toLowerCase(), ...container, fileSize: fs.statSync(file).size });
};
assert.ok(heavyInfo.videoBitRate > 33e6, `fonte pesada com ${heavyInfo.videoBitRate}`);
// (o ffmpeg grava edit list por padrão no AAC: o pesado também não cumpre por isso)
assert.ok(specOf(src.heavy).problems.some((p) => p.code === 'bitrate'), specOf(src.heavy).reason);
assert.equal(specOf(src.compliant).ok, true, `fonte que cumpre: ${specOf(src.compliant).reason}`);
assert.equal(mp4HasFaststart(src.hevc), false, 'o .mov de teste precisa estar sem faststart');
assert.equal(specOf(src.hevc).ok, false);
ok(`vídeos de teste: H.264 ${mbps(heavyInfo.videoBitRate)} (${mb(heavyInfo.size)}), H.264 ${mbps(compliantInfo.videoBitRate)} que cumpre, .mov ${hevcInfo.codec} ${mbps(hevcInfo.videoBitRate)} sem faststart`);

// ── Arquivos e linhas antes da subida ──────────────────────────
let nameSeq = 0;
function place(source, folder, ext, ageDays = 0) {
  nameSeq += 1;
  const name = `${1762000000000 + nameSeq}_${crypto.randomBytes(6).toString('hex')}${ext}`;
  const rel = `${folder}/${name}`;
  const full = path.join(UPLOAD_ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.copyFileSync(source, full);
  if (ageDays) {
    const when = new Date(Date.now() - ageDays * 86_400_000);
    fs.utimesSync(full, when, when);
  }
  return { rel, full, url: `${PUBLIC}/${rel}`, ig: igVariantPath(full), web: webVariantPath(full) };
}
const folder = (n) => `content/${ids.client}/0000000${n}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
const hevc = place(src.hevc, folder(1), '.mov'); // post na hora: adiado e publicado depois
const late = place(src.heavy, folder(2), '.mp4'); // 30 min de atraso: vai o original
const story70 = place(src.story70, folder(3), '.mp4');
const short = place(src.short, folder(4), '.mp4');
const compliant = place(src.compliant, folder(5), '.mp4');
// versões de edição com a .ig.mp4 ao lado: a limpeza diária apaga a versão 1 e a .ig.mp4 dela
const versions = [1, 2, 3].map(() => place(src.short, `content/${ids.client}/${ids.task}`, '.mp4', 3));
for (const v of versions) fs.copyFileSync(src.short, v.ig);
// original sem uso no banco com a .ig.mp4 ao lado, e uma .ig.mp4 sem original
const unused = place(src.short, `content/${ids.client}/sem-uso`, '.mp4');
fs.copyFileSync(src.short, unused.ig);
const orphanIg = path.join(UPLOAD_ROOT, `content/${ids.client}/sem-original/1762999999999_cafebabe0000.ig.mp4`);
fs.mkdirSync(path.dirname(orphanIg), { recursive: true });
fs.copyFileSync(src.short, orphanIg);

const USERS = [ids.admin];
await pool.query(`DELETE FROM scheduled_posts WHERE client_id = $1`, [ids.client]);
// Banco de teste: posts agendados de outras suítes não disputam a vez do robô com os deste teste
await pool.query(`UPDATE scheduled_posts SET status = 'cancelado' WHERE status IN ('agendado', 'publicando')`);
await pool.query(`DELETE FROM social_accounts WHERE client_id = $1`, [ids.client]);
await pool.query(`DELETE FROM edit_versions WHERE task_id = $1`, [ids.task]).catch(() => {});
await pool.query(`DELETE FROM content_tasks WHERE id = $1`, [ids.task]);
await pool.query(`DELETE FROM clients WHERE id = $1`, [ids.client]);
await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [USERS]);
await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [USERS]);
await pool.query(`INSERT INTO profiles (id, name, email, role) VALUES ($1, 'Admin Instagram', 'admin-ig@teste.local', 'admin')`, USERS);
await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, USERS);
await pool.query(`INSERT INTO clients (id, company_name, city, status) VALUES ($1, 'Clínica Instagram', 'minacu', 'ativo')`, [ids.client]);
await pool.query(
  `INSERT INTO social_accounts (client_id, platform, account_name, username, instagram_business_id, access_token, status, api_base)
   VALUES ($1, 'instagram', 'Perfil Teste', 'perfil.teste', 'ig-teste-1', 'token-falso', 'connected', 'facebook')`,
  [ids.client]
);
await pool.query(
  `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link, created_at, updated_at)
   VALUES ($1, $2, 'Card com versões', 'reels', 'edicao', $3, now() - interval '3 days', now() - interval '3 days')`,
  [ids.task, ids.client, versions[2].url]
);
for (const [i, v] of versions.entries()) {
  await pool.query(`INSERT INTO edit_versions (task_id, version, video_url, created_at) VALUES ($1, $2, $3, now() - interval '3 days')`, [ids.task, i + 1, v.url]);
}
await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB, PRIMARY KEY (job, day))`);
await pool.query(`DELETE FROM pulse_job_runs WHERE job = 'limpeza_versoes_video_v2'`);

// ── Sobe o servidor com a Meta falsa ───────────────────────────
const server = spawn('node', ['--import', path.join(API_DIR, 'tests', 'helpers', 'meta-falsa.mjs'), path.join(API_DIR, 'server.mjs')], {
  cwd: API_DIR,
  env: {
    ...process.env, DATABASE_URL: DB, JWT_SECRET: SECRET, API_PORT: String(PORT), UPLOAD_ROOT,
    PUBLIC_UPLOADS_URL: PUBLIC, GOOGLE_GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '',
    META_FALSA_LOG: META_LOG, META_FALSA_UPLOAD_ROOT: UPLOAD_ROOT, META_FALSA_MEDIA_ORIGIN: MEDIA_ORIGIN,
    WEB_VIDEO_PAUSE_MS: '0', WEB_VIDEO_BACKFILL_DELAY_MS: '3600000', WEB_VIDEO_BACKFILL_INTERVAL_MS: '0',
    WEB_VIDEO_STATE_DIR: STATE, WEB_VIDEO_MIN_FREE_BYTES: '0', WEB_VIDEO_MIN_FREE_RATIO: '0',
    // sem a passada inicial nem a periódica: a tarefa roda logo depois de cada agendamento
    IG_VIDEO_SCAN_DELAY_MS: '3600000', IG_VIDEO_SCAN_INTERVAL_MS: '0', IG_VIDEO_SCAN_SOON_MS: '300', IG_VIDEO_RECHECK_MS: '1000',
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
  console.error('--- log do servidor (fim) ---\n' + serverLog.split('\n').filter((l) => /video-|social-posts|limpeza|upload|Error|error/i.test(l)).slice(-60).join('\n'));
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
const igLines = () => serverLog.split('\n').filter((l) => l.includes('[video-instagram]'));
const webLines = () => serverLog.split('\n').filter((l) => l.includes('[video-leve]'));
const metaCalls = () => (fs.existsSync(META_LOG) ? fs.readFileSync(META_LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const containers = (marker) => metaCalls().filter((c) => c.kind === 'meta' && c.method === 'POST' && c.path.endsWith('/media') && String(c.params.caption || '').includes(marker));
const postRow = async (id) => (await pool.query(`SELECT * FROM scheduled_posts WHERE id = $1`, [id])).rows[0];
async function insertPost({ url, caption, minutesAgo, type = 'reels' }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO scheduled_posts (client_id, platform, publish_type, media_url, caption, scheduled_at)
     VALUES ($1, 'instagram', $2, $3, $4, now() - make_interval(mins => $5::int)) RETURNING id`,
    [ids.client, type, url, caption, minutesAgo]
  );
  return row.id;
}

const team = jwt.sign({ sub: ids.admin, email: 'admin-ig@teste.local', role: 'admin' }, SECRET, { expiresIn: '1h' });
const asTeam = { Authorization: `Bearer ${team}` };
async function schedule(body) {
  const res = await fetch(`${BASE}/social-posts`, {
    method: 'POST', headers: { ...asTeam, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: ids.client, platform: 'instagram', scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), ...body }),
  });
  return { status: res.status, body: await res.json() };
}
async function upload(file, uploadFolder) {
  const form = new FormData();
  form.append('folder', uploadFolder);
  form.append('file', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), path.basename(file));
  const res = await fetch(`${BASE}/upload`, { method: 'POST', headers: asTeam, body: form });
  const body = await res.json();
  assert.equal(res.status, 200, `upload: ${JSON.stringify(body)}`);
  const full = path.join(UPLOAD_ROOT, body.path);
  return { url: body.url, rel: body.path, full, ig: igVariantPath(full), web: webVariantPath(full) };
}

// ── 1. Post na hora sem a .ig.mp4 pronta: adiado (sem erro) e publicado depois ──
// O upload pesado entra antes na fila da versão leve: a versão Instagram do post na hora passa na frente dos outros.
const heavy = await upload(src.heavy, `content/${ids.client}/upload-pesado`);
assert.ok(heavy.url.startsWith(`${PUBLIC}/content/`), heavy.url);
const deferredId = await insertPost({ url: hevc.url, caption: 'Post na hora #post-adiado', minutesAgo: 1 });
const lateId = await insertPost({ url: late.url, caption: 'Post atrasado #post-atrasado #recusa-original', minutesAgo: 31 });
await waitFor(() => igLines().some((l) => l.includes(`post ${deferredId} adiado`)), 'post adiado', 60_000);
let row = await postRow(deferredId);
assert.ok(['agendado', 'publicando'].includes(row.status), `adiado continua agendado (${row.status})`);
assert.equal(row.attempts, 0, 'adiar não conta tentativa');
assert.equal(row.last_error, null, 'adiar não grava erro');
assert.equal(containers('#post-adiado').length, 0, 'nada foi enviado à Meta enquanto o vídeo convertia');
row = await waitFor(async () => { const r = await postRow(deferredId); return r.status === 'publicado' ? r : null; }, 'post adiado publicado', 120_000);
assert.equal(row.attempts, 1);
assert.equal(row.last_error, null);
assert.equal(row.media_url, hevc.url, 'o banco continua com a URL do original');
let sent = containers('#post-adiado');
assert.equal(sent.length, 1, 'uma publicação só');
assert.equal(sent[0].params.video_url, igVariantUrl(hevc.url), 'a Meta recebeu a .ig.mp4');
assert.equal(sent[0].params.media_type, 'REELS');
const hevcIg = probe(hevc.ig);
assert.equal(specOf(hevc.ig, 'reels').ok, true, specOf(hevc.ig).reason);
assert.equal(hevcIg.codec, hevcInfo.codec, 'só o contêiner mudou: o vídeo foi copiado');
assert.ok(igLines().some((l) => l.includes('convertendo:') && l.includes(hevc.rel) && l.includes('sem recodificar')), 'sem recodificar');
ok(`post na hora: adiado sem erro e publicado depois com a .ig.mp4 (.mov ${hevcInfo.codec} sem faststart → .ig.mp4 com faststart, sem recodificar, ${mb(hevcInfo.size)} → ${mb(hevcIg.size)})`);

// ── 2. 30 min de atraso: vai o original; a Meta recusa e o post fica 'erro' com o motivo ──
row = await waitFor(async () => { const r = await postRow(lateId); return r.status === 'erro' ? r : null; }, 'post atrasado com erro', 60_000);
assert.equal(row.attempts, 1, 'sem nova tentativa');
assert.match(row.last_error, /^O vídeo não ficou pronto no formato do Instagram a tempo e foi enviado o original: .*vídeo de \d+\.\d Mbps \(máximo 25 Mbps\)\./);
assert.match(row.last_error, /A publicação falhou: instagram: .*format that we don't support/);
sent = containers('#post-atrasado');
assert.equal(sent.length, 1);
assert.equal(sent[0].params.video_url, late.url, 'foi o original');
ok(`30 min de atraso: foi o original e, com a Meta recusando, ficou 'erro': "${row.last_error.slice(0, 110)}…"`);

// ── 3. Validação ao agendar: story de 70 s e reels de 2 s ──
let r = await schedule({ publish_type: 'stories', media_url: story70.url });
assert.equal(r.status, 400, JSON.stringify(r.body));
assert.equal(r.body.error, 'Story em vídeo aceita no máximo 60 s (este vídeo tem 1 min 10 s).');
r = await schedule({ publish_type: 'reels', media_url: short.url });
assert.equal(r.status, 400, JSON.stringify(r.body));
assert.equal(r.body.error, 'Reels precisa ter pelo menos 3 s (este vídeo tem 2 s).');
r = await schedule({ publish_type: 'reels', media_url: story70.url, caption: 'reels de 70 s pode' });
assert.equal(r.status, 200, JSON.stringify(r.body));
await pool.query(`UPDATE scheduled_posts SET status = 'cancelado' WHERE id = $1`, [r.body.post.id]);
assert.equal((await pool.query(`SELECT count(*)::int AS n FROM scheduled_posts WHERE client_id = $1 AND media_url = ANY($2)`, [ids.client, [short.url]])).rows[0].n, 0);
ok('ao agendar: story de 70 s e reels de 2 s recusados com mensagem clara; reels de 70 s aceito');

// ── 4. Reels com original de 40 Mbps: a tarefa gera a .ig.mp4 dentro da especificação ──
r = await schedule({ publish_type: 'reels', media_url: heavy.url, caption: 'Reels pesado #post-pesado' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const heavyPostId = r.body.post.id;
await waitFor(() => fs.existsSync(heavy.ig), '.ig.mp4 do reels pesado', 120_000);
const heavyIg = probe(heavy.ig);
const heavySpec = specOf(heavy.ig, 'reels');
assert.equal(heavySpec.ok, true, heavySpec.reason);
assert.ok(heavyIg.videoBitRate <= 25e6, `taxa ${heavyIg.videoBitRate}`);
assert.equal(mp4HasFaststart(heavy.ig), true, 'faststart');
assert.equal(inspectMp4Container(heavy.ig).editList, 'none', 'sem edit list');
assert.equal(heavyIg.codec, 'h264');
assert.equal(heavyIg.pixFmt, 'yuv420p');
assert.equal(heavyIg.audioCodec, 'aac');
assert.equal(heavyIg.sampleRate, 48000);
assert.equal(heavyIg.channels, 2);
assert.equal(`${heavyIg.width}x${heavyIg.height}`, '1080x1920');
assert.ok(Math.abs(heavyIg.duration - heavyInfo.duration) < 0.2, `duração ${heavyIg.duration} x ${heavyInfo.duration}`);
assert.equal(fs.statSync(heavy.full).size, fs.statSync(src.heavy).size, 'original intacto');
assert.ok(igLines().some((l) => l.includes('na fila:') && l.includes(heavy.rel) && l.includes('post agendado')), 'entrou na fila pela tarefa dos agendados');
ok(`reels de ${mbps(heavyInfo.videoBitRate)} (${mb(heavyInfo.size)}) → .ig.mp4 H.264 ${mbps(heavyIg.videoBitRate)} (${mb(heavyIg.size)}), yuv420p, AAC ${heavyIg.sampleRate / 1000} kHz ${Math.round(heavyIg.audioBitRate / 1000)} kbps, faststart, sem edit list, mesma duração`);

// ── 5. Original que cumpre: nada é convertido ──
r = await schedule({ publish_type: 'reels', media_url: compliant.url, caption: 'Reels que cumpre #post-cumpre' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const compliantPostId = r.body.post.id;
await waitFor(() => igLines().some((l) => l.includes('original cumpre a especificação') && l.includes(compliant.rel)), 'original que cumpre');

// ── 6. Na hora de publicar: o robô usa a .ig.mp4 do pesado e o original do que cumpre ──
await pool.query(`UPDATE scheduled_posts SET scheduled_at = now() - interval '5 seconds' WHERE id = ANY($1::uuid[])`, [[heavyPostId, compliantPostId]]);
for (const id of [heavyPostId, compliantPostId]) {
  await waitFor(async () => (await postRow(id)).status === 'publicado', `post ${id} publicado`, 60_000);
}
sent = containers('#post-pesado');
assert.equal(sent.length, 1);
assert.equal(sent[0].params.video_url, igVariantUrl(heavy.url), 'pesado: a .ig.mp4');
assert.equal((await postRow(heavyPostId)).media_url, heavy.url, 'o banco continua com o original');
sent = containers('#post-cumpre');
assert.equal(sent.length, 1);
assert.equal(sent[0].params.video_url, compliant.url, 'que cumpre: o original');
assert.equal(fs.existsSync(compliant.ig), false, 'nada convertido');
assert.equal(igLines().filter((l) => l.includes(compliant.rel) && /convertendo|na fila/.test(l)).length, 0);
const media = metaCalls().filter((c) => c.kind === 'media').map((c) => c.url);
assert.ok(media.includes(igVariantUrl(heavy.url)), 'a Meta falsa conferiu a URL da .ig.mp4');
ok('robô: pesado foi com a .ig.mp4, o que cumpre foi com o original e nada foi convertido; media_url no banco igual');

// ── 7. As filas não se misturam ──
await waitFor(() => fs.existsSync(heavy.web), 'versão leve do upload pesado', 120_000);
let res = await fetch(`${BASE}/media/playback?url=${encodeURIComponent(igVariantUrl(heavy.url))}`, { headers: asTeam });
assert.deepEqual(await res.json(), { url: igVariantUrl(heavy.url), variant: 'original' }, '.ig.mp4 não ganha versão leve');
r = await schedule({ publish_type: 'reels', media_url: `${PUBLIC}/${path.relative(UPLOAD_ROOT, heavy.web)}`, caption: 'versão leve agendada' });
assert.equal(r.status, 200, JSON.stringify(r.body));
await sleep(2500);
await pool.query(`UPDATE scheduled_posts SET status = 'cancelado' WHERE id = $1`, [r.body.post.id]);
assert.ok(!webLines().some((l) => l.includes('.ig.mp4')), 'nenhuma .ig.mp4 na fila da versão leve');
assert.ok(!igLines().some((l) => l.includes('.web.mp4')), 'nenhuma .web.mp4 na fila da versão Instagram');
const allFiles = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f); else allFiles.push(f); } };
walk(UPLOAD_ROOT);
assert.ok(!allFiles.some((f) => /\.(web|ig)\.(web|ig)\.mp4$/.test(f)), 'nenhuma cópia de cópia');
assert.ok(fs.existsSync(heavy.web) && fs.existsSync(heavy.ig) && heavy.web !== heavy.ig, 'as duas cópias lado a lado');
// uma conversão por vez entre as duas filas
let active = 0;
let maxActive = 0;
for (const line of serverLog.split('\n').filter((l) => /\[video-(leve|instagram)\]/.test(l))) {
  if (line.includes('convertendo:')) { active += 1; maxActive = Math.max(maxActive, active); }
  if (/pronto:|falhou|descartado/.test(line) && active > 0) active -= 1;
}
assert.equal(maxActive, 1, 'nunca duas conversões ao mesmo tempo');
ok('filas: a .ig.mp4 não entra na versão leve, a .web.mp4 não entra na versão Instagram; uma conversão por vez');

// ── 8. Limpeza: diária, DELETE do upload e auditoria de órfãos ──
await waitFor(async () => (await pool.query(`SELECT 1 FROM pulse_job_runs WHERE job = 'limpeza_versoes_video_v2' AND result IS NOT NULL`)).rowCount, 'limpeza diária', 60_000);
assert.equal(fs.existsSync(versions[0].full), false, 'versão 1 apagada');
assert.equal(fs.existsSync(versions[0].ig), false, '.ig.mp4 da versão 1 apagada junto');
for (const v of versions.slice(1)) assert.ok(fs.existsSync(v.full) && fs.existsSync(v.ig), 'versões 2 e 3 ficam com a .ig.mp4');
const { rows: cleanupRows } = await pool.query(`SELECT bytes FROM upload_cleanup_log WHERE task_id = $1`, [ids.task]);
assert.equal(cleanupRows.length, 1);
assert.equal(Number(cleanupRows[0].bytes), fs.statSync(src.short).size * 2, 'bytes do original + .ig.mp4');

res = await fetch(`${BASE}/portal-videos/orphan-audit?minAgeDays=0`, { headers: asTeam });
const audit = await res.json();
assert.equal(res.status, 200, JSON.stringify(audit));
const listed = new Set(audit.files.map((f) => f.path));
assert.ok(listed.has(unused.rel), 'original sem uso aparece');
assert.ok(!listed.has(path.relative(UPLOAD_ROOT, unused.ig)), 'a .ig.mp4 dele não aparece sozinha');
assert.ok(!listed.has(path.relative(UPLOAD_ROOT, hevc.ig)), '.ig.mp4 com original não conta como sem uso');
assert.ok(listed.has(path.relative(UPLOAD_ROOT, orphanIg)), '.ig.mp4 sem original conta como sem uso');
res = await fetch(`${BASE}/portal-videos/delete-orphans`, {
  method: 'POST', headers: { ...asTeam, 'Content-Type': 'application/json' },
  body: JSON.stringify({ paths: [unused.rel], minAgeDays: 0 }),
});
assert.equal(res.status, 200);
assert.equal(fs.existsSync(unused.full), false);
assert.equal(fs.existsSync(unused.ig), false, 'apagar o original pela auditoria leva a .ig.mp4 junto');

res = await fetch(`${BASE}/upload`, { method: 'DELETE', headers: { ...asTeam, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `/uploads/${heavy.rel}` }) });
assert.equal(res.status, 200, await res.text());
assert.equal(fs.existsSync(heavy.full), false);
assert.equal(fs.existsSync(heavy.ig), false, 'DELETE leva a .ig.mp4 junto');
assert.equal(fs.existsSync(heavy.web), false, 'e a .web.mp4');
assert.ok(fs.existsSync(hevc.ig), 'a .ig.mp4 de outro original fica');
assert.equal(fs.readdirSync(path.join(UPLOAD_ROOT, '.web-tmp')).length, 0, 'sem temporário largado');
ok('limpeza diária, DELETE do upload e auditoria de órfãos apagam a .ig.mp4 junto com o original; com o original no lugar ela fica');

// ── 9. Nada saiu para a Meta de verdade ──
assert.ok(metaCalls().every((c) => c.kind === 'media' || /facebook\.com|instagram\.com/.test(c.host)));
assert.ok(!/ENOTFOUND graph\./.test(serverLog));
ok(`Meta falsa: ${metaCalls().filter((c) => c.kind === 'meta').length} chamadas simuladas, nenhuma para a Meta de verdade`);

await pool.end();
stop();
console.log('video-instagram.e2e: tudo certo');
process.exit(0);

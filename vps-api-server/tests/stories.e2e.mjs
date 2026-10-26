// Teste de ponta a ponta dos stories no módulo Agendamentos (storySeries.mjs): link do WhatsApp por cliente,
// "Postar sozinho", "Lembrete com link" (o robô nunca publica; aviso no sino e no WhatsApp pelo PULSE, uma vez,
// reforço uma vez, "Postado" encerra) e a repetição (a cada N dias, dias da semana, arrastar uma data, "este e os
// próximos", cancelar sem mexer na publicada, gerador sem duplicar). Sem Meta: as mídias são http local.
//
// Uso (do diretório vps-api-server):
//   TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_stories node tests/stories.e2e.mjs
// O banco precisa ter o esquema da produção (ex.: CREATE DATABASE pulse_stories TEMPLATE pulse_db).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { brtParts, brtToIso } from '../lib/postingTime.mjs';
import { listOccurrences, normalizeRule, weekdayIndex } from '../lib/storyRecurrence.mjs';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:teste@localhost:55432/pulse_stories';
const PORT = Number(process.env.TEST_API_PORT || 5237);
const SECRET = 'segredo-teste-stories';
const BASE = `http://127.0.0.1:${PORT}/api`;
pg.types.setTypeParser(1082, (value) => value);
const pool = new pg.Pool({ connectionString: DB });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-stories-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label) => console.log(`✓ ${label}`);
const MEDIA = (name) => `http://127.0.0.1:9/${name}`;
const DAY = 86_400_000;
const WINDOW_DAYS = 30;

const ids = {
  plus: '00000000-0000-0000-0000-00000000c801', admin: '00000000-0000-0000-0000-00000000c802',
  social: '00000000-0000-0000-0000-00000000c803', socialUru: '00000000-0000-0000-0000-00000000c804',
  editor: '00000000-0000-0000-0000-00000000c805',
  cli: '00000000-0000-0000-0000-00000000c811', cliNoAcc: '00000000-0000-0000-0000-00000000c812',
  taskAuto: '00000000-0000-0000-0000-00000000c821', taskLembrete: '00000000-0000-0000-0000-00000000c822',
  taskSerie: '00000000-0000-0000-0000-00000000c823', taskPast: '00000000-0000-0000-0000-00000000c824',
  design: '00000000-0000-0000-0000-00000000c831', portal: '00000000-0000-0000-0000-00000000c841',
  number: '00000000-0000-0000-0000-00000000c851', numberUru: '00000000-0000-0000-0000-00000000c852',
};
const PEOPLE = [ids.plus, ids.admin, ids.social, ids.socialUru, ids.editor];
const CLIENTS = [ids.cli, ids.cliNoAcc];
const PHONE = '5562988880101';
const PHONE_URU = '5562988880102';

async function waitFor(fn, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`tempo esgotado: ${label}`);
    await sleep(250);
  }
}

const today = brtParts(new Date()).date;
const addDays = (key, n) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const rangeFrom = addDays(today, -10);
const rangeTo = addDays(today, 45);

async function cleanup() {
  const posts = `SELECT id FROM scheduled_posts WHERE client_id = ANY($1)`;
  await pool.query(`DELETE FROM notifications WHERE link IN (SELECT '/lembrete-story/' || id FROM scheduled_posts WHERE client_id = ANY($1))`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM notifications WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM wa_outbox WHERE to_number IN ($1, $2)`, [PHONE, PHONE_URU]).catch(() => {});
  await pool.query(`DELETE FROM assistant_conversations WHERE number_id IN ($1, $2)`, [ids.number, ids.numberUru]).catch(() => {});
  await pool.query(`DELETE FROM assistant_log WHERE number_id IN ($1, $2)`, [ids.number, ids.numberUru]).catch(() => {});
  await pool.query(`DELETE FROM assistant_numbers WHERE id IN ($1, $2)`, [ids.number, ids.numberUru]).catch(() => {});
  void posts;
  await pool.query(`DELETE FROM scheduled_posts WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM story_series WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM short_link_clicks WHERE short_link_id IN (SELECT short_link_id FROM client_story_links WHERE client_id = ANY($1))`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM short_links WHERE id IN (SELECT short_link_id FROM client_story_links WHERE client_id = ANY($1))`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM short_links WHERE slug LIKE 'clinica-stories-wa%' OR slug LIKE 'loja-lembrete-wa%'`).catch(() => {});
  await pool.query(`DELETE FROM client_story_links WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM task_history WHERE task_id IN (SELECT id FROM content_tasks WHERE client_id = ANY($1))`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM design_task_history WHERE task_id IN (SELECT id FROM design_tasks WHERE client_id = ANY($1))`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM social_media_deliveries WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM client_portal_notifications WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM client_portal_contents WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM content_tasks WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM design_tasks WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM social_accounts WHERE client_id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM clients WHERE id = ANY($1)`, [CLIENTS]).catch(() => {});
  await pool.query(`DELETE FROM module_access WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM user_cities WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [PEOPLE]).catch(() => {});
  await pool.query(`DELETE FROM profiles WHERE id = ANY($1)`, [PEOPLE]).catch(() => {});
}

async function fixtures() {
  await pool.query(
    `INSERT INTO profiles (id, name, email, role) VALUES
       ($1, 'Teo Plus', 'teo.stories@teste.local', 'admin'),
       ($2, 'Ana Admin Stories', 'ana.stories@teste.local', 'admin'),
       ($3, 'Sara Social', 'sara.stories@teste.local', 'social_media'),
       ($4, 'Ulisses Uruaçu', 'ulisses.stories@teste.local', 'social_media'),
       ($5, 'Edu Editor', 'edu.stories@teste.local', 'editor')`,
    PEOPLE
  );
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin'), ($2, 'admin'), ($3, 'social_media'), ($4, 'social_media'), ($5, 'editor')`,
    PEOPLE
  );
  await pool.query(`INSERT INTO user_cities (user_id, city, is_primary) VALUES ($1, 'minacu', true), ($2, 'uruacu', true)`, [ids.social, ids.socialUru]);
  // Pulse Plus antes da subida: com a lista cheia, a semente não roda
  await pool.query(`INSERT INTO module_access (module, user_id, created_by) VALUES ('pulse_plus', $1, 'teste') ON CONFLICT DO NOTHING`, [ids.plus]);
  await pool.query(
    `INSERT INTO clients (id, company_name, city, status, color, whatsapp) VALUES
       ($1, 'Clínica Stories', 'minacu', 'ativo', '330 80% 55%', '(62) 99999-0101'),
       ($2, 'Loja Lembrete', 'minacu', 'ativo', '30 90% 50%', '62 98888-7777')`,
    CLIENTS
  );
  await pool.query(
    `INSERT INTO social_accounts (client_id, platform, account_name, username, instagram_business_id, access_token, status, api_base)
     VALUES ($1, 'instagram', 'clinica.stories', 'clinica.stories', '1789000000801', 'token-falso-teste', 'connected', 'facebook')`,
    [ids.cli]
  );
  await pool.query(
    `INSERT INTO content_tasks (id, client_id, title, content_type, kanban_column, edited_video_link, approved_at) VALUES
       ($1, $5, 'Story sozinho', 'story', 'agendamentos', $6, now() - interval '2 days'),
       ($2, $7, 'Story com link', 'story', 'agendamentos', $8, now() - interval '2 days'),
       ($3, $5, 'Story de 2 em 2 dias', 'story', 'agendamentos', $9, now() - interval '1 day'),
       ($4, $5, 'Story começa antes', 'story', 'agendamentos', $10, now() - interval '1 day')`,
    [ids.taskAuto, ids.taskLembrete, ids.taskSerie, ids.taskPast, ids.cli, MEDIA('auto.mp4'), ids.cliNoAcc, MEDIA('lembrete.mp4'),
      MEDIA('serie.mp4'), MEDIA('antes.mp4')]
  );
  await pool.query(
    `INSERT INTO design_tasks (id, client_id, title, format_type, kanban_column, attachment_url, client_approved_at)
     VALUES ($1, $2, 'Arte da segunda', 'story', 'aprovado', $3, now() - interval '1 day')`,
    [ids.design, ids.cli, MEDIA('segunda.png')]
  );
  await pool.query(
    `INSERT INTO client_portal_contents (id, client_id, title, content_type, file_url, status, approved_at, season_month, season_year)
     VALUES ($1, $2, 'Story do portal', 'story', $3, 'aprovado', now(), 10, 2026)`,
    [ids.portal, ids.cli, MEDIA('portal.mp4')]
  );
  // PULSE ligado e dois números com a permissão: um de Minaçu (da Sara) e um só de Uruaçu
  await pool.query(`UPDATE assistant_settings SET enabled = true WHERE id = 1`).catch(() => {});
  await pool.query(
    `INSERT INTO assistant_numbers (id, name, phone, user_id, cities, permissions) VALUES
       ($1, 'Sara', $2, $3, ARRAY['minacu'], ARRAY['lembretes_stories']),
       ($4, 'Ulisses', $5, $6, ARRAY['uruacu'], ARRAY['lembretes_stories'])`,
    [ids.number, PHONE, ids.social, ids.numberUru, PHONE_URU, ids.socialUru]
  );
}

// ── Sobe o servidor ──
await cleanup();
let assistantWasEnabled = false;
try {
  const { rows } = await pool.query(`SELECT enabled FROM assistant_settings WHERE id = 1`);
  assistantWasEnabled = !!rows[0]?.enabled;
} catch { /* banco novo: o servidor cria */ }
await fixtures().catch((error) => {
  // banco novo: tabelas do assistente ainda não existem (o servidor cria na subida)
  if (!['42P01', '42703'].includes(error?.code)) throw error;
});
const server = spawn('node', [path.join(API_DIR, 'server.mjs')], {
  cwd: API_DIR,
  env: {
    ...process.env, DATABASE_URL: DB, JWT_SECRET: SECRET, API_PORT: String(PORT),
    ANTHROPIC_API_KEY: '', GOOGLE_GEMINI_API_KEY: '', OPENAI_API_KEY: '',
    UPLOAD_ROOT: path.join(TMP, 'uploads'), PUBLIC_UPLOADS_URL: 'https://agenciapulse.tech/uploads',
    WA_PRIVATE_DIR: path.join(TMP, 'wa'), ASSISTANT_DISABLED: '1', TEMPERATURE_DISABLED: '1',
    STORY_REMINDER_TICK_MS: '1000', STORY_SERIES_TICK_MS: '2000',
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
// esquema dos stories pronto (o gerador roda na subida)
await waitFor(async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.story_series') AS t`);
  return !!rows[0].t;
}, 'tabela story_series');
await cleanup();
await fixtures();

const token = (id, email, role) => jwt.sign({ sub: id, email, role }, SECRET, { expiresIn: '1h' });
const auth = {
  plus: token(ids.plus, 'teo.stories@teste.local', 'admin'),
  admin: token(ids.admin, 'ana.stories@teste.local', 'admin'),
  social: token(ids.social, 'sara.stories@teste.local', 'social_media'),
  editor: token(ids.editor, 'edu.stories@teste.local', 'editor'),
};
const api = async (method, url, body, { as = auth.plus, city = 'minacu' } = {}) => {
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${as}`, 'x-pulse-city': city },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const row = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rows = async (sql, params) => (await pool.query(sql, params)).rows;
const materials = (clientId) => api('GET', `/scheduling/clients/${clientId}/materials?from=${rangeFrom}&to=${rangeTo}`);
const seriesPosts = (seriesId) => rows(
  `SELECT * FROM scheduled_posts WHERE story_series_id = $1 ORDER BY series_slot_at`, [seriesId]
);
const iso = (v) => new Date(v).toISOString();

try {
  // ── Acesso: tudo do módulo pede Pulse Plus (403 para admin sem ele) ──
  const fakeId = '00000000-0000-0000-0000-00000000c899';
  for (const [method, url, body] of [
    ['GET', `/scheduling/clients/${ids.cli}/story-link`],
    ['PUT', `/scheduling/clients/${ids.cli}/story-link`, { whatsapp: '62999990101' }],
    ['POST', '/scheduling/stories/series', { client_id: ids.cli, kind: 'conteudo', id: ids.taskSerie }],
    ['POST', `/scheduling/stories/series/${fakeId}/update`, { client_id: ids.cli }],
    ['POST', `/scheduling/stories/series/${fakeId}/cancel`, { client_id: ids.cli }],
    ['POST', `/scheduling/stories/occurrence/${fakeId}`, { client_id: ids.cli }],
    ['POST', `/scheduling/stories/occurrence/${fakeId}/cancel`, { client_id: ids.cli }],
  ]) {
    const r = await api(method, url, body, { as: auth.admin });
    assert.equal(r.status, 403, `${method} ${url} sem Pulse Plus`);
  }
  let r = await fetch(`${BASE}/scheduling/clients/${ids.cli}/story-link`);
  assert.equal(r.status, 401);
  ok('rotas dos stories sem Pulse Plus: 403 (admin) e sem login: 401');

  // ── Link do story por cliente ──
  r = await api('GET', `/scheduling/clients/${ids.cli}/story-link`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.link.saved, false);
  assert.equal(r.json.link.whatsapp, '5562999990101', 'padrão: o WhatsApp do cadastro do cliente');
  assert.equal(r.json.link.url, 'https://wa.me/5562999990101');
  assert.deepEqual(r.json.link.button_texts, ['Clique aqui', 'Agende sua consulta', 'Fale conosco']);
  const team = r.json.team.map((t) => t.id);
  assert.ok(team.includes(ids.social) && team.includes(ids.plus) && team.includes(ids.admin));
  assert.ok(!team.includes(ids.socialUru), 'social media de Uruaçu fora da equipe de Minaçu');
  assert.ok(!team.includes(ids.editor));

  r = await api('PUT', `/scheduling/clients/${ids.cli}/story-link`, { whatsapp: '62999990101', responsible_user_id: ids.socialUru });
  assert.equal(r.status, 400, 'responsável de outra cidade');
  r = await api('PUT', `/scheduling/clients/${ids.cli}/story-link`, { whatsapp: '123' });
  assert.equal(r.status, 400);
  r = await api('PUT', `/scheduling/clients/${ids.cli}/story-link`, {
    whatsapp: '(62) 99999-0101', message: 'Olá! Vi o story e quero agendar', custom_text: 'Quero desconto',
    default_text: 'Agende sua consulta', responsible_user_id: ids.social,
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const link = r.json.link;
  assert.equal(link.wa_url, 'https://wa.me/5562999990101?text=Ol%C3%A1!%20Vi%20o%20story%20e%20quero%20agendar');
  assert.equal(link.short_url, 'https://agenciapulse.tech/r/clinica-stories-wa');
  assert.equal(link.url, link.short_url, 'o story usa o link curto (conta os cliques)');
  assert.deepEqual(link.button_texts, ['Clique aqui', 'Agende sua consulta', 'Fale conosco', 'Quero desconto']);
  assert.equal(link.default_text, 'Agende sua consulta');
  const short = await row(`SELECT * FROM short_links WHERE slug = 'clinica-stories-wa'`);
  assert.equal(short.original_url, link.wa_url);
  assert.equal(short.city, 'minacu');
  r = await fetch(`${BASE}/public/short-links/clinica-stories-wa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await r.json()).original_url, link.wa_url);
  await waitFor(async () => (await row(`SELECT count(*)::int AS n FROM short_link_clicks WHERE short_link_id = $1`, [short.id])).n === 1, 'clique contado');
  r = await api('PUT', `/scheduling/clients/${ids.cli}/story-link`, {
    whatsapp: '62999990101', message: 'Olá! Vi o story e quero agendar', custom_text: 'Quero desconto',
    default_text: 'Agende sua consulta', responsible_user_id: ids.social,
  });
  assert.equal(r.json.link.clicks, 1);
  assert.equal((await row(`SELECT count(*)::int AS n FROM short_links WHERE slug LIKE 'clinica-stories-wa%'`)).n, 1, 'salvar de novo reaproveita o link curto');
  r = await materials(ids.cli);
  assert.equal(r.json.story_link.url, 'https://agenciapulse.tech/r/clinica-stories-wa');
  assert.equal(r.json.story_link.default_text, 'Agende sua consulta');
  ok('link do cliente: wa.me com a mensagem, link curto que conta cliques, botões e padrão; vem preenchido no calendário');

  // ── Story "Postar sozinho": vira post automático (o robô pega) ──
  const dayAuto = addDays(today, 3);
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cli, kind: 'conteudo', id: ids.taskAuto, date: dayAuto, time: '10:00', mode: 'auto',
    platform: 'instagram', publish_type: 'stories', story_mode: 'auto', story_link: 'https://agenciapulse.tech/r/x', caption: 'não vai',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const autoPost = await row(`SELECT * FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskAuto]);
  assert.equal(autoPost.publish_type, 'stories');
  assert.equal(autoPost.story_mode, 'auto');
  assert.equal(autoPost.caption, '', 'story sem legenda');
  assert.equal(autoPost.story_link, null, 'postar sozinho não leva link');
  assert.equal(autoPost.scheduled_at.toISOString(), brtToIso(dayAuto, '10:00'));
  await pool.query(`UPDATE scheduled_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1`, [autoPost.id]);

  // ── Story "Lembrete com link": cliente sem conta conectada também agenda ──
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskLembrete, date: addDays(today, 2), time: '09:00', mode: 'auto',
    platform: 'instagram', publish_type: 'stories', story_mode: 'auto',
  });
  assert.equal(r.status, 400, 'postar sozinho precisa de conta');
  r = await api('POST', '/scheduling/schedule', {
    client_id: ids.cliNoAcc, kind: 'conteudo', id: ids.taskLembrete, date: addDays(today, 2), time: '09:00', mode: 'auto',
    platform: 'instagram', publish_type: 'stories', story_mode: 'lembrete',
    story_link: 'https://wa.me/5562988887777', story_link_text: 'Fale conosco',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const lembrete = await row(`SELECT * FROM scheduled_posts WHERE content_task_id = $1 AND status = 'agendado'`, [ids.taskLembrete]);
  assert.equal(lembrete.story_mode, 'lembrete');
  assert.equal(lembrete.story_link_text, 'Fale conosco');
  r = await materials(ids.cliNoAcc);
  const lembreteItem = r.json.scheduled.find((i) => i.key === `conteudo:${ids.taskLembrete}`);
  assert.equal(lembreteItem.post.story_mode, 'lembrete');
  assert.equal(lembreteItem.state, 'agendado');
  r = await api('POST', `/social-posts/${lembrete.id}/publish-now`, {});
  assert.equal(r.status, 400, 'Publicar agora não publica lembrete');
  assert.equal((await row(`SELECT status FROM scheduled_posts WHERE id = $1`, [lembrete.id])).status, 'agendado');

  // Chega a hora: aviso no sino de quem cuida do cliente (sem responsável: admin e social media da cidade)
  await pool.query(`UPDATE scheduled_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1`, [lembrete.id]);
  const reminded = await waitFor(async () => {
    const p = await row(`SELECT * FROM scheduled_posts WHERE id = $1`, [lembrete.id]);
    return p.reminder_sent_at ? p : null;
  }, 'lembrete enviado', 20_000);
  assert.equal(reminded.status, 'agendado');
  assert.equal(reminded.attempts, 0);
  const pageLink = `/lembrete-story/${lembrete.id}`;
  await sleep(1500);
  let notes = await rows(`SELECT * FROM notifications WHERE link = $1 ORDER BY created_at`, [pageLink]);
  const noteUsers = notes.map((n) => n.user_id);
  assert.ok(noteUsers.includes(ids.admin) && noteUsers.includes(ids.plus) && noteUsers.includes(ids.social), 'admin e social media de Minaçu');
  assert.ok(!noteUsers.includes(ids.socialUru), 'social media de Uruaçu não recebe');
  assert.ok(!noteUsers.includes(ids.editor));
  assert.equal(new Set(noteUsers).size, noteUsers.length, 'um aviso por pessoa');
  const firstNote = notes.find((n) => n.user_id === ids.social);
  assert.equal(firstNote.title, '📲 Story para postar: Loja Lembrete');
  assert.equal(firstNote.message, 'Story com link · Poste pelo app com o adesivo de link na parte de baixo. Botão: Fale conosco. Link: https://wa.me/5562988887777');
  assert.equal(firstNote.city, 'minacu');
  assert.doesNotMatch(notes.map((n) => `${n.title} ${n.message}`).join(' '), /\bIA\b|rob[oô]/i);
  // WhatsApp pelo PULSE: o número da Sara (Minaçu, permissão marcada), não o de Uruaçu
  let outbox = await rows(`SELECT * FROM wa_outbox WHERE to_number IN ($1, $2) ORDER BY created_at`, [PHONE, PHONE_URU]);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to_number, PHONE);
  assert.equal(outbox[0].purpose, 'assistente');
  assert.match(outbox[0].body, /Story para postar agora: Loja Lembrete/);
  assert.match(outbox[0].body, /Vídeo: http:\/\/127\.0\.0\.1:9\/lembrete\.mp4/, 'o vídeo original para baixar');
  assert.match(outbox[0].body, /Poste pelo app com o adesivo de link na parte de baixo\. Botão: Fale conosco\. Link: https:\/\/wa\.me\/5562988887777/);
  assert.match(outbox[0].body, new RegExp(`/lembrete-story/${lembrete.id}`));
  // Mais voltas do laço: nada repetido
  await sleep(3000);
  assert.equal((await rows(`SELECT id FROM notifications WHERE link = $1`, [pageLink])).length, notes.length, 'aviso sai uma vez só');
  assert.equal((await rows(`SELECT id FROM wa_outbox WHERE to_number IN ($1, $2)`, [PHONE, PHONE_URU])).length, 1);
  ok('lembrete: no horário avisa no sino (cidade do cliente) e no WhatsApp pelo PULSE, uma vez, com vídeo, link e botão');

  // Sem "Postado" em 2 horas: reforço uma vez
  await pool.query(`UPDATE scheduled_posts SET reminder_sent_at = now() - interval '121 minutes' WHERE id = $1`, [lembrete.id]);
  await waitFor(async () => (await row(`SELECT reminder_followup_at FROM scheduled_posts WHERE id = $1`, [lembrete.id])).reminder_followup_at, 'reforço', 20_000);
  await sleep(2500);
  notes = await rows(`SELECT * FROM notifications WHERE link = $1 ORDER BY created_at`, [pageLink]);
  const followups = notes.filter((n) => n.title === '⏰ Story ainda não postado: Loja Lembrete');
  assert.equal(followups.length, noteUsers.length, 'reforço uma vez para cada pessoa');
  outbox = await rows(`SELECT * FROM wa_outbox WHERE to_number IN ($1, $2) ORDER BY created_at`, [PHONE, PHONE_URU]);
  assert.equal(outbox.length, 2);
  assert.match(outbox[1].body, /ainda não foi marcado como postado/);
  ok('sem "Postado" em 2 horas: o aviso é reforçado uma vez');

  // Página do lembrete e "Postado": social media sem Pulse Plus pode; editor não
  r = await api('GET', `/story-reminders/${lembrete.id}`, null, { as: auth.editor });
  assert.equal(r.status, 403);
  r = await api('GET', `/story-reminders/${lembrete.id}`, null, { as: auth.social });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.reminder.state, 'avisado');
  assert.equal(r.json.reminder.media_url, MEDIA('lembrete.mp4'));
  assert.equal(r.json.reminder.button_text, 'Fale conosco');
  assert.equal(r.json.reminder.guidance, 'Poste pelo app com o adesivo de link na parte de baixo. Botão: Fale conosco. Link: https://wa.me/5562988887777');
  r = await api('POST', `/story-reminders/${lembrete.id}/posted`, {}, { as: auth.editor });
  assert.equal(r.status, 403);
  r = await api('POST', `/story-reminders/${lembrete.id}/posted`, {}, { as: auth.social });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const posted = await row(`SELECT * FROM scheduled_posts WHERE id = $1`, [lembrete.id]);
  assert.equal(posted.status, 'publicado');
  assert.equal(posted.manual_posted_by, ids.social);
  assert.equal(posted.attempts, 0, 'o robô nunca tentou publicar');
  assert.equal((await row(`SELECT kanban_column FROM content_tasks WHERE id = $1`, [ids.taskLembrete])).kanban_column, 'arquivado');
  assert.equal((await row(`SELECT status FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskLembrete])).status, 'postado');
  assert.equal((await row(`SELECT count(*)::int AS n FROM notifications WHERE link = $1 AND read IS NOT TRUE`, [pageLink])).n, 0, 'avisos lidos');
  r = await api('POST', `/story-reminders/${lembrete.id}/posted`, {}, { as: auth.social });
  assert.equal(r.json.already, true);
  r = await materials(ids.cliNoAcc);
  const postedItem = r.json.scheduled.find((i) => i.key === `conteudo:${ids.taskLembrete}`);
  assert.equal(postedItem.state, 'publicado');
  assert.equal(postedItem.post.manual_posted, true);
  // Postado encerra: nenhum aviso a mais
  await pool.query(`UPDATE scheduled_posts SET reminder_followup_at = NULL, reminder_sent_at = now() - interval '5 hours' WHERE id = $1`, [lembrete.id]);
  await sleep(2500);
  assert.equal((await rows(`SELECT id FROM notifications WHERE link = $1`, [pageLink])).length, notes.length);
  assert.equal((await rows(`SELECT id FROM wa_outbox WHERE to_number IN ($1, $2)`, [PHONE, PHONE_URU])).length, 2);
  ok('"Postado" (social media sem Pulse Plus): story publicado, card arquivado, entrega postada e os avisos param');

  // ── Repetição a cada 2 dias ("Postar sozinho") ──
  r = await api('POST', '/scheduling/stories/series', {
    client_id: ids.cli, kind: 'conteudo', id: ids.taskSerie, date: addDays(today, 1), time: '09:00', platform: 'instagram',
    story_mode: 'auto', repeat: { kind: 'interval', interval_days: 2, end_kind: 'never' },
  }, { city: 'uruacu' });
  assert.equal(r.status, 404, 'cliente de Minaçu não agenda pela cidade de Uruaçu');
  r = await api('POST', '/scheduling/stories/series', {
    client_id: ids.cli, kind: 'conteudo', id: ids.taskSerie, date: addDays(today, 1), time: '09:00', platform: 'instagram',
    story_mode: 'auto', repeat: { kind: 'interval', interval_days: 2, end_kind: 'never' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const serie2 = r.json.series;
  assert.equal(serie2.label, 'A cada 2 dias às 09:00');
  const createdAt = Date.now();
  const rule2 = normalizeRule({ kind: 'interval', interval_days: 2, time: '09:00', start_date: addDays(today, 1) });
  const expected2 = listOccurrences(rule2, { fromMs: createdAt + 60_000, toMs: createdAt + WINDOW_DAYS * DAY });
  let occ2 = await seriesPosts(serie2.id);
  assert.equal(occ2.length, expected2.length, 'uma linha por data até 30 dias à frente');
  assert.deepEqual(occ2.map((p) => iso(p.series_slot_at)), expected2.map((o) => o.at));
  assert.ok(occ2.every((p) => iso(p.scheduled_at) === iso(p.series_slot_at) && p.status === 'agendado' && p.story_mode === 'auto'));
  assert.ok(occ2.every((p) => brtParts(p.scheduled_at).time === '09:00'), '9h de Brasília');
  assert.equal(brtParts(occ2[1].scheduled_at).date, addDays(brtParts(occ2[0].scheduled_at).date, 2));
  let task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskSerie]);
  assert.equal(task.kanban_column, 'acompanhamento');
  assert.equal(task.posting_at.toISOString(), occ2[0].scheduled_at.toISOString(), 'a data do card é a primeira');
  const deliverySerie = await row(`SELECT * FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskSerie]);
  assert.equal(deliverySerie.status, 'agendado');
  assert.ok(occ2.every((p) => p.delivery_id === deliverySerie.id && p.content_task_id === ids.taskSerie));
  r = await materials(ids.cli);
  assert.ok(!r.json.unscheduled.some((i) => i.key === `conteudo:${ids.taskSerie}`), 'material da repetição sai dos não agendados');
  assert.ok(!r.json.scheduled.some((i) => i.key === `conteudo:${ids.taskSerie}`), 'e não aparece como item próprio');
  const occItems = r.json.scheduled.filter((i) => i.series?.id === serie2.id && !i.virtual);
  assert.equal(occItems.length, occ2.filter((p) => brtParts(p.scheduled_at).date <= rangeTo).length, 'cada data é um item no calendário');
  assert.ok(occItems.every((i) => i.kind === 'post' && i.type === 'story' && i.series.label === 'A cada 2 dias às 09:00'));
  const virtual = r.json.scheduled.filter((i) => i.series?.id === serie2.id && i.virtual);
  const expectedVirtual = listOccurrences(rule2, { fromMs: createdAt + WINDOW_DAYS * DAY + 1, toMs: Date.parse(brtToIso(rangeTo, '23:59')) });
  assert.equal(virtual.length, expectedVirtual.length, 'datas além da janela aparecem como previstas');
  assert.ok(virtual.every((i) => i.kind === 'serie' && i.locked));
  ok('repetição a cada 2 dias: ocorrências certas (9h de Brasília) até 30 dias, cada uma no calendário, previstas depois');

  // Gerador rodando de novo (a cada 2 s no teste) não duplica; a chave única segura
  await sleep(4500);
  assert.equal((await seriesPosts(serie2.id)).length, occ2.length, 'gerador duas vezes não duplica');
  await assert.rejects(
    pool.query(
      `INSERT INTO scheduled_posts (client_id, platform, publish_type, media_url, scheduled_at, story_mode, story_series_id, series_slot_at)
       VALUES ($1, 'instagram', 'stories', $2, $3, 'auto', $4, $3)`,
      [ids.cli, MEDIA('serie.mp4'), occ2[0].series_slot_at, serie2.id]
    ),
    (error) => error.code === '23505'
  );
  ok('gerador duas vezes não duplica (chave única série + horário)');

  // Repetição que começa no passado: nada no passado
  r = await api('POST', '/scheduling/stories/series', {
    client_id: ids.cli, kind: 'conteudo', id: ids.taskPast, date: addDays(today, -5), time: '07:00', platform: 'instagram',
    story_mode: 'auto', repeat: { kind: 'interval', interval_days: 1, end_kind: 'count', max_count: 8 },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const pastPosts = await seriesPosts(r.json.series.id);
  assert.ok(pastPosts.length >= 2 && pastPosts.length <= 3, `só as datas futuras das 8 (${pastPosts.length})`);
  assert.ok(pastPosts.every((p) => p.scheduled_at.getTime() > Date.now()));
  r = await api('POST', '/scheduling/stories/series/' + r.json.series.id + '/cancel', { client_id: ids.cli });
  assert.equal(r.status, 200);
  assert.equal(r.json.restored, true, 'cancelada sem nada publicado: o material volta');
  assert.equal((await row(`SELECT kanban_column FROM content_tasks WHERE id = $1`, [ids.taskPast])).kanban_column, 'agendamentos');
  ok('repetição que começa no passado só grava datas futuras; cancelada sem publicar, o material volta para não agendados');

  // ── "Toda segunda às 8h" (lembrete) numa arte ──
  r = await api('POST', '/scheduling/stories/series', {
    client_id: ids.cli, kind: 'arte', id: ids.design, date: today, time: '08:00', platform: 'instagram', story_mode: 'lembrete',
    story_link: 'https://agenciapulse.tech/r/clinica-stories-wa', story_link_text: 'Agende sua consulta',
    repeat: { kind: 'weekly', weekdays: [0], end_kind: 'never' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const serieSeg = r.json.series;
  assert.equal(serieSeg.label, 'Toda segunda às 08:00');
  const ruleSeg = normalizeRule({ kind: 'weekly', weekdays: [0], time: '08:00', start_date: today });
  const expectedSeg = listOccurrences(ruleSeg, { fromMs: Date.now() + 60_000, toMs: Date.now() + WINDOW_DAYS * DAY });
  let occSeg = await seriesPosts(serieSeg.id);
  assert.equal(occSeg.length, expectedSeg.length);
  assert.ok(occSeg.every((p) => weekdayIndex(brtParts(p.scheduled_at).date) === 0 && brtParts(p.scheduled_at).time === '08:00'), 'segunda 8h de Brasília');
  assert.ok(occSeg.every((p) => p.scheduled_at.getUTCHours() === 11), '8h de Brasília = 11h UTC');
  assert.ok(occSeg.every((p) => p.story_mode === 'lembrete' && p.story_link_text === 'Agende sua consulta' && p.design_task_id === ids.design));
  assert.equal((await row(`SELECT kanban_column FROM design_tasks WHERE id = $1`, [ids.design])).kanban_column, 'aprovado');
  ok('repetição "toda segunda 8h" (lembrete): só segundas, 8h de Brasília, com o link e o botão');

  // ── Arrastar uma ocorrência muda só ela ──
  occ2 = await seriesPosts(serie2.id);
  const dragged = occ2[1];
  const draggedDay = addDays(brtParts(dragged.scheduled_at).date, 1);
  r = await api('POST', '/scheduling/reschedule', { client_id: ids.cli, kind: 'post', id: dragged.id, date: draggedDay });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const afterDrag = await seriesPosts(serie2.id);
  for (const p of afterDrag) {
    const before = occ2.find((o) => o.id === p.id);
    if (p.id === dragged.id) {
      assert.equal(iso(p.scheduled_at), brtToIso(draggedDay, '09:00'), 'mesma hora no dia novo');
      assert.equal(iso(p.series_slot_at), iso(dragged.series_slot_at), 'o horário original da série fica guardado');
    } else {
      assert.equal(iso(p.scheduled_at), iso(before.scheduled_at), 'as outras não mudam');
    }
  }
  await sleep(4500);
  assert.equal((await seriesPosts(serie2.id)).length, occ2.length, 'o gerador não recria a data arrastada');
  ok('arrastar uma ocorrência muda só ela (data, mantendo a hora) e o gerador não a recria');

  // ── "Só este": hora e modo de uma data ──
  const single = afterDrag[2];
  r = await api('POST', `/scheduling/stories/occurrence/${single.id}`, {
    client_id: ids.cli, date: brtParts(single.scheduled_at).date, time: '20:15', platform: 'instagram', story_mode: 'lembrete',
    story_link: 'https://agenciapulse.tech/r/clinica-stories-wa', story_link_text: 'Quero desconto',
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const singleAfter = await row(`SELECT * FROM scheduled_posts WHERE id = $1`, [single.id]);
  assert.equal(brtParts(singleAfter.scheduled_at).time, '20:15');
  assert.equal(singleAfter.story_mode, 'lembrete');
  assert.equal(singleAfter.story_link_text, 'Quero desconto');
  assert.equal((await row(`SELECT count(*)::int AS n FROM scheduled_posts WHERE story_series_id = $1 AND story_mode = 'lembrete'`, [serie2.id])).n, 1);
  ok('"só este": muda hora, modo e botão de uma data');

  // ── "Este e os próximos" a partir da 4ª data: a cada 3 dias às 18h ──
  const fromOcc = afterDrag[3];
  r = await api('POST', `/scheduling/stories/series/${serie2.id}/update`, {
    client_id: ids.cli, from_slot: iso(fromOcc.series_slot_at), date: brtParts(fromOcc.series_slot_at).date, time: '18:00',
    platform: 'instagram', story_mode: 'auto', repeat: { kind: 'interval', interval_days: 3, end_kind: 'never' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const serie3 = r.json.series;
  assert.equal(serie3.label, 'A cada 3 dias às 18:00');
  const oldSeries = await row(`SELECT * FROM story_series WHERE id = $1`, [serie2.id]);
  assert.equal(oldSeries.status, 'encerrada');
  const oldPosts = await seriesPosts(serie2.id);
  for (const p of oldPosts) {
    if (p.series_slot_at.getTime() < fromOcc.series_slot_at.getTime()) assert.equal(p.status, 'agendado', 'as anteriores ficam');
    else assert.equal(p.status, 'cancelado', 'as próximas da regra antiga saem');
  }
  assert.equal((await row(`SELECT parent_series_id FROM story_series WHERE id = $1`, [serie3.id])).parent_series_id, serie2.id);
  const newPosts = await seriesPosts(serie3.id);
  assert.equal(brtParts(newPosts[0].scheduled_at).date, brtParts(fromOcc.series_slot_at).date);
  assert.ok(newPosts.every((p) => brtParts(p.scheduled_at).time === '18:00'));
  assert.equal(brtParts(newPosts[1].scheduled_at).date, addDays(brtParts(newPosts[0].scheduled_at).date, 3));
  r = await api('POST', `/scheduling/stories/series/${serie2.id}/update`, {
    client_id: ids.cli, from_slot: iso(oldPosts[0].series_slot_at), time: '10:00', repeat: { kind: 'interval', interval_days: 1 },
  });
  assert.equal(r.status, 409, 'repetição encerrada não muda "este e os próximos"');
  r = await materials(ids.cli);
  assert.ok(r.json.scheduled.some((i) => i.series?.id === serie3.id), 'a regra nova aparece no calendário');
  ok('"este e os próximos": as datas anteriores ficam, as próximas seguem a regra nova (a cada 3 dias, 18h)');

  // ── Cancelar a série não mexe na publicada ──
  occSeg = await seriesPosts(serieSeg.id);
  await pool.query(`UPDATE scheduled_posts SET scheduled_at = now() - interval '1 minute' WHERE id = $1`, [occSeg[0].id]);
  await waitFor(async () => (await row(`SELECT reminder_sent_at FROM scheduled_posts WHERE id = $1`, [occSeg[0].id])).reminder_sent_at, 'lembrete da série');
  r = await api('POST', `/story-reminders/${occSeg[0].id}/posted`, {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await row(`SELECT kanban_column FROM design_tasks WHERE id = $1`, [ids.design])).kanban_column, 'postado');
  // A arte está em Postadas: a próxima data da série segue valendo (o robô e o gerador aceitam)
  await sleep(4500);
  assert.equal((await row(`SELECT status FROM story_series WHERE id = $1`, [serieSeg.id])).status, 'ativa', 'arte postada pela própria série não encerra a repetição');
  r = await api('POST', `/scheduling/stories/series/${serieSeg.id}/cancel`, { client_id: ids.cli });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.restored, false);
  const segAfter = await seriesPosts(serieSeg.id);
  assert.equal(segAfter[0].status, 'publicado', 'a publicada não muda');
  assert.ok(segAfter.slice(1).every((p) => p.status === 'cancelado'), 'as futuras pendentes saem');
  assert.equal((await row(`SELECT status FROM story_series WHERE id = $1`, [serieSeg.id])).status, 'cancelada');
  assert.equal((await row(`SELECT kanban_column FROM design_tasks WHERE id = $1`, [ids.design])).kanban_column, 'postado');
  r = await materials(ids.cli);
  assert.ok(r.json.scheduled.some((i) => i.key === `post:${segAfter[0].id}` && i.state === 'publicado'), 'a publicada continua no calendário');
  assert.ok(!r.json.unscheduled.some((i) => i.key === `arte:${ids.design}`));
  assert.ok(!r.json.scheduled.some((i) => i.series?.id === serieSeg.id && i.virtual), 'sem previstas depois de cancelar');
  ok('cancelar a série cancela as futuras pendentes e não mexe na publicada');

  // ── "Só este" cancelado até a última: a repetição termina e o material volta ──
  r = await api('POST', `/scheduling/stories/series/${serie3.id}/cancel`, { client_id: ids.cli });
  assert.equal(r.status, 200);
  assert.equal(r.json.restored, false, 'ainda há datas da regra antiga pendentes');
  const leftovers = (await seriesPosts(serie2.id)).filter((p) => p.status === 'agendado');
  assert.equal(leftovers.length, 3);
  for (const p of leftovers) {
    r = await api('POST', `/scheduling/stories/occurrence/${p.id}/cancel`, { client_id: ids.cli });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  task = await row(`SELECT * FROM content_tasks WHERE id = $1`, [ids.taskSerie]);
  assert.equal(task.kanban_column, 'agendamentos', 'sem nenhuma data, o card volta para Agendamentos');
  assert.equal(task.posting_at, null);
  assert.equal((await row(`SELECT status FROM social_media_deliveries WHERE content_task_id = $1`, [ids.taskSerie])).status, 'entregue');
  r = await materials(ids.cli);
  assert.ok(r.json.unscheduled.some((i) => i.key === `conteudo:${ids.taskSerie}`));
  ok('"só este" cancelado em todas as datas: o material volta para não agendados');

  // ── Material sai do estado aprovado: o gerador encerra a repetição e cancela as pendentes ──
  r = await api('POST', '/scheduling/stories/series', {
    client_id: ids.cli, kind: 'portal', id: ids.portal, date: addDays(today, 1), time: '12:00', platform: 'instagram',
    story_mode: 'auto', repeat: { kind: 'weekly', weekdays: [1, 3], end_kind: 'count', max_count: 4 },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const seriePortal = r.json.series;
  assert.equal((await seriesPosts(seriePortal.id)).length, 4, 'fim por número de vezes');
  await pool.query(`UPDATE client_portal_contents SET status = 'pendente' WHERE id = $1`, [ids.portal]);
  await waitFor(async () => (await row(`SELECT status FROM story_series WHERE id = $1`, [seriePortal.id])).status === 'cancelada', 'gerador encerra', 15_000);
  assert.ok((await seriesPosts(seriePortal.id)).every((p) => p.status === 'cancelado'));
  const endNote = await row(`SELECT * FROM notifications WHERE user_id = $1 AND title = 'Repetição de stories encerrada'`, [ids.plus]);
  assert.match(endNote.message, /Story do portal/);
  ok('material que sai de aprovado: a repetição é encerrada, as datas pendentes saem e quem criou é avisado');

  // ── O robô nunca publicou nenhum lembrete; o "Postar sozinho" vencido passou pelo robô ──
  await waitFor(async () => (await row(`SELECT attempts FROM scheduled_posts WHERE id = $1`, [autoPost.id])).attempts >= 1, 'robô pega o story automático', 40_000);
  const autoAfter = await row(`SELECT * FROM scheduled_posts WHERE id = $1`, [autoPost.id]);
  assert.match(autoAfter.last_error || '', /https/, 'chegou a tentar publicar (a mídia de teste é http e nada sai)');
  const lembretes = await rows(`SELECT * FROM scheduled_posts WHERE client_id = ANY($1) AND story_mode = 'lembrete'`, [CLIENTS]);
  assert.ok(lembretes.length >= 2);
  assert.ok(lembretes.every((p) => p.attempts === 0 && !(p.result && JSON.stringify(p.result).includes('"platform"'))), 'robô nunca tentou publicar lembrete');
  ok('"Postar sozinho" vencido é pego pelo robô; nenhum lembrete passou pelo robô');

  console.log('\nTodos os testes de stories passaram.');
} catch (error) {
  console.error('\nFALHOU:', error);
  console.error('\n--- log do servidor (fim) ---\n', serverLog.slice(-4000));
  process.exitCode = 1;
} finally {
  stop();
  await cleanup().catch(() => {});
  await pool.query(`UPDATE assistant_settings SET enabled = $1 WHERE id = 1`, [assistantWasEnabled]).catch(() => {});
  await pool.end();
}

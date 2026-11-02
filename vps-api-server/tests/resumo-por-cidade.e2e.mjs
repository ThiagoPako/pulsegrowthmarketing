// Resumo do dia em PDF, separado por cidade (pedido do usuário, 01/11/2026: "enviar os relatórios separados … para o
// Victor, os relatórios só de Minaçu"). Postgres embutido (PGlite) com um dia fictício nas duas cidades: o resumo de
// Minaçu não pode trazer nenhum cliente ou valor de Uruaçu (e vice-versa), e o envio manda uma mensagem por cidade.
//
// Uso (do diretório vps-api-server, com as dependências da API instaladas):
//   npm i --no-save @electric-sql/pglite && node tests/resumo-por-cidade.e2e.mjs [pasta para os PDFs de exemplo]
// FOTOS=<pasta com marcely.png, davi.png…> usa fotos de verdade nos agentes (sem ela, todos saem com a inicial).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'resumo-cidades-'));
fs.mkdirSync(OUT, { recursive: true });
const ok = (m) => console.log('✓', m);
const db = await PGlite.create();
const pool = {
  async query(q, p) {
    if (p && p.length) return db.query(q, p);
    try { return await db.query(q); } catch (e) {
      if (!/multiple commands/i.test(e.message)) throw e;
      return (await db.exec(q)).at(-1);
    }
  },
};
process.env.WA_PRIVATE_DIR = path.join(os.tmpdir(), 'wa-priv-resumo');

// fotos: as dos agentes (agentes/fotos do OPEN CUT), servidas como o /uploads da VPS
const FOTOS = process.env.FOTOS || '';
const photoServer = http.createServer((req, res) => {
  const f = path.join(FOTOS, path.basename(decodeURIComponent(req.url)));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', 'image/png');
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => photoServer.listen(0, '127.0.0.1', r));
const FOTO = (n) => `http://127.0.0.1:${photoServer.address().port}/${n}.png`;

await pool.query(`
  CREATE TABLE profiles (id UUID PRIMARY KEY, name TEXT, display_name TEXT, role TEXT, avatar_url TEXT, job_title TEXT);
  CREATE TABLE clients (id UUID PRIMARY KEY, company_name TEXT, city TEXT, is_admin_client BOOLEAN DEFAULT false, status TEXT, whatsapp_group TEXT, responsible_person TEXT, whatsapp TEXT);
  CREATE TABLE partners (phone TEXT);
  CREATE TABLE holidays (id SERIAL);
  CREATE TABLE client_portal_contents (id SERIAL, status TEXT);
  CREATE TABLE content_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID, title TEXT, kanban_column TEXT, city TEXT,
    urgent_at TIMESTAMPTZ, waiting_material_at TIMESTAMPTZ, editing_deadline TIMESTAMPTZ, alteration_deadline TIMESTAMPTZ,
    assigned_to UUID, agent_step TEXT, agent_heartbeat_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE design_tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), client_id UUID, title TEXT, kanban_column TEXT, city TEXT,
    assigned_to UUID, agent_step TEXT, agent_heartbeat_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE task_history (id SERIAL, task_id UUID, user_id UUID, action TEXT, city TEXT, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE design_task_history (id SERIAL, task_id UUID, user_id UUID, action TEXT, city TEXT, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE edit_versions (id SERIAL, task_id UUID, created_by UUID, version INT, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE recordings (id SERIAL, client_id UUID, prospect_name TEXT, videomaker_id UUID, date DATE, status TEXT, city TEXT);
  CREATE TABLE scheduled_posts (id SERIAL, client_id UUID, created_by UUID, status TEXT, caption TEXT, published_at TIMESTAMPTZ, scheduled_at TIMESTAMPTZ);
  CREATE TABLE social_media_deliveries (id SERIAL, client_id UUID, created_by UUID, status TEXT, title TEXT, posted_at DATE);
  CREATE TABLE agent_keys (id SERIAL, user_id UUID, role TEXT, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), last_used_at TIMESTAMPTZ);
  CREATE TABLE agent_activity (user_id UUID PRIMARY KEY, status TEXT, updated_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE cash_reserve_movements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), amount NUMERIC, type TEXT, description TEXT,
    date DATE DEFAULT CURRENT_DATE, created_at TIMESTAMPTZ DEFAULT now(), is_reserve BOOLEAN DEFAULT false, city TEXT);
  CREATE TABLE billing_messages (id SERIAL, client_id UUID, message_type TEXT, status TEXT, sent_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE financial_activity_log (id SERIAL, user_id UUID, action_type TEXT, entity_type TEXT, entity_id UUID, description TEXT, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE payment_links (id SERIAL, revenue_id UUID, status TEXT, paid_at TIMESTAMPTZ);
  CREATE TABLE revenues (id UUID PRIMARY KEY, client_id UUID, description TEXT, amount NUMERIC, status TEXT);
  CREATE TABLE expense_categories (id UUID PRIMARY KEY, name TEXT);
  CREATE TABLE expenses (id UUID PRIMARY KEY, description TEXT, category_id UUID, amount NUMERIC);
`);
const { ensureAssistantSchema } = await import('../assistant/schema.mjs');
await ensureAssistantSchema(pool);

// ── um dia fictício ──
const U = (n) => `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const people = [
  [1, 'Thiago', 'admin', null, 'Diretor'], [2, 'Naay', 'social_media', null, null], [3, 'Victor', 'videomaker', null, null],
  [4, 'Iggor', 'editor', null, null], [10, 'Marcely', 'editor', FOTO('marcely'), null], [11, 'Davi', 'editor', FOTO('davi'), null],
  [12, 'Beatriz', 'editor', FOTO('beatriz'), null], [13, 'Uriel', 'editor', FOTO('uriel'), null], [14, 'Íris', 'editor', FOTO('iris'), null],
  [15, 'Caio', 'editor', FOTO('caio'), null], [16, 'Lívia', 'designer', FOTO('livia'), null],
];
for (const [i, name, role, avatar, job] of people) await pool.query(`INSERT INTO profiles VALUES ($1, $2, NULL, $3, $4, $5)`, [U(i), name, role, avatar, job]);
for (const [i, role] of [[10, 'chefe'], [11, 'editor'], [12, 'editor'], [13, 'revisor'], [14, 'colorista'], [15, 'som'], [16, 'designer']]) {
  await pool.query(`INSERT INTO agent_keys (user_id, role) VALUES ($1, $2)`, [U(i), role]);
}
const C = (n) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const clients = [[1, 'Rede A3P', 'minacu'], [2, 'AlvesCred', 'uruacu'], [3, 'Clínica Sorriso', 'minacu'], [4, 'Casa Lar', 'uruacu'], [5, 'Padaria Pão Quente', 'uruacu']];
for (const [i, n, city] of clients) await pool.query(`INSERT INTO clients (id, company_name, city) VALUES ($1, $2, $3)`, [C(i), n, city]);
const T = (n) => `20000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
const tasks = [
  [1, 1, 'Energia honesta · reels', 'revisao', 'minacu'], [2, 2, 'G4 · O que levamos', 'revisao', 'uruacu'], [3, 2, 'G4 · Aprendendo', 'alteracao', 'uruacu'],
  [4, 3, 'Clareamento em 1 sessão', 'envio', 'minacu'], [5, 4, 'Tour pela loja', 'edicao', 'uruacu'], [6, 5, 'Pão de queijo do dia', 'edicao', 'uruacu'],
];
for (const [i, c, title, col, city] of tasks) await pool.query(`INSERT INTO content_tasks (id, client_id, title, kanban_column, city) VALUES ($1, $2, $3, $4, $5)`, [T(i), C(c), title, col, city]);
await pool.query(`UPDATE content_tasks SET editing_deadline = now() - interval '5 hours' WHERE id = $1`, [T(5)]);
await pool.query(`UPDATE content_tasks SET urgent_at = now(), assigned_to = $2, agent_step = 'renderizando', agent_heartbeat_at = now() - interval '50 minutes' WHERE id = $1`, [T(3), U(12)]);
await pool.query(`UPDATE content_tasks SET assigned_to = $2, agent_step = 'cortando', agent_heartbeat_at = now() - interval '5 minutes' WHERE id = $1`, [T(6), U(11)]);
await pool.query(`UPDATE content_tasks SET waiting_material_at = now() WHERE id = $1`, [T(5)]);
const D = (n) => `30000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
for (const [i, c, title] of [[1, 3, 'Promo de novembro · feed'], [2, 5, 'Cardápio da semana'], [3, 1, 'Feriado 02/11']]) {
  await pool.query(`INSERT INTO design_tasks (id, client_id, title, kanban_column, city) VALUES ($1, $2, $3, 'em_analise', 'minacu')`, [D(i), C(c), title]);
}
await pool.query(`UPDATE design_tasks SET assigned_to = $2, agent_step = 'exportando', agent_heartbeat_at = now() WHERE id = $1`, [D(2), U(16)]);
const H = async (task, user, action, n = 1) => { for (let k = 0; k < n; k++) await pool.query(`INSERT INTO task_history (task_id, user_id, action, city) VALUES ($1, $2, $3, 'minacu')`, [T(task), U(user), action]); };
await H(1, 11, 'Alteração iniciada'); await H(2, 12, 'Alteração iniciada'); await H(3, 12, 'Alteração iniciada');
await H(1, 13, 'Parecer da Análise'); await H(2, 13, 'Parecer da Análise'); await H(4, 13, 'Parecer da Análise');
await H(1, 10, 'Enviado para Revisão'); await H(2, 10, 'Enviado para Revisão');
await H(4, 2, '✅ Aprovado pela equipe'); await H(4, 2, 'Enviado para Cliente'); await H(3, 2, 'Solicitado Alteração');
await H(6, 1, 'Movido para Edição');
for (const [t, u] of [[1, 11], [2, 12], [4, 11]]) await pool.query(`INSERT INTO edit_versions (task_id, created_by, version) VALUES ($1, $2, 1)`, [T(t), U(u)]);
const DH = async (task, user, action) => pool.query(`INSERT INTO design_task_history (task_id, user_id, action, city) VALUES ($1, $2, $3, 'minacu')`, [D(task), U(user), action]);
await DH(1, 16, 'Arte entregue'); await DH(2, 16, 'Arte entregue'); await DH(3, 16, 'Arte enviada'); await DH(1, 1, 'Aprovada');
await pool.query(`INSERT INTO recordings (client_id, videomaker_id, date, status, city) VALUES ($1, $3, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'concluida', 'minacu'),
  ($2, $3, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 'concluida', 'uruacu')`, [C(3), C(4), U(3)]);
await pool.query(`INSERT INTO scheduled_posts (client_id, created_by, status, caption, published_at) VALUES ($1, $2, 'publicado', 'Clareamento em 1 sessão ✨', now())`, [C(3), U(2)]);
await pool.query(`INSERT INTO social_media_deliveries (client_id, created_by, status, title, posted_at) VALUES ($1, $2, 'postado', 'Feriado 02/11', (now() AT TIME ZONE 'America/Sao_Paulo')::date)`, [C(1), U(2)]);
await pool.query(`INSERT INTO agent_activity VALUES ($1, 'atendendo o WhatsApp do Thiago', now()), ($2, 'cor da Casa Lar: esperando espaço no disco', now()), ($3, 'som do G4 A pronto', now())`, [U(10), U(14), U(15)]);
// financeiro
const R = (n) => `40000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;
await pool.query(`INSERT INTO revenues VALUES ($1, $3, NULL, 1200, 'recebida'), ($2, $4, NULL, 850, 'recebida')`, [R(1), R(2), C(2), C(3)]);
await pool.query(`INSERT INTO payment_links (revenue_id, status, paid_at) VALUES ($1, 'pago', now())`, [R(1)]);
const CAT = '50000000-0000-0000-0000-000000000001';
const E1 = '60000000-0000-0000-0000-000000000001';
await pool.query(`INSERT INTO expense_categories VALUES ($1, 'Combustível')`, [CAT]);
await pool.query(`INSERT INTO expenses VALUES ($1, 'Gasolina do carro da gravação', $2, 180)`, [E1, CAT]);
await pool.query(`INSERT INTO cash_reserve_movements (amount, type, description, city) VALUES
  (1200, 'entrada', '[Receita] AlvesCred - R$ 1.200,00 - ID: ${R(1)}', 'uruacu'),
  (850, 'entrada', '[Receita] Clínica Sorriso - R$ 850,00 - ID: ${R(2)}', 'minacu'),
  (180, 'saida', '[Despesa] Gasolina do carro da gravação - ID: ${E1}', 'minacu'),
  (5000, 'entrada', 'saldo anterior', 'minacu')`);
await pool.query(`UPDATE cash_reserve_movements SET date = date - 30, created_at = now() - interval '30 days' WHERE description = 'saldo anterior'`);
await pool.query(`INSERT INTO financial_activity_log (user_id, action_type, entity_type, entity_id, description) VALUES ($1, 'edição', 'receita', $2, 'Baixa'), ($1, 'criação', 'despesa', $3, 'Gasolina')`, [U(2), R(2), E1]);
await pool.query(`INSERT INTO billing_messages (client_id, message_type, status) VALUES ($1, 'cobranca', 'enviada'), ($2, 'lembrete', 'enviada')`, [C(4), C(5)]);

// ── coleta por cidade ──
const { collectDayPdf, dailyPdfSpec } = await import('../assistant/dailyReportPdf.mjs');
const { renderDailyPdf } = await import('../lib/dailyPdf.mjs');
const URUACU = ['AlvesCred', 'Casa Lar', 'Padaria Pão Quente'];
const MINACU = ['Rede A3P', 'Clínica Sorriso'];
const min = await collectDayPdf(pool, ['minacu'], { financeiro: true });
const uru = await collectDayPdf(pool, ['Uruaçu'], { financeiro: true }); // nome com acento também vale
const specMin = dailyPdfSpec(min, { financeiro: true });
const specUru = dailyPdfSpec(uru, { financeiro: true });
const textMin = JSON.stringify(specMin);
const textUru = JSON.stringify(specUru);
for (const c of URUACU) assert.ok(!textMin.includes(c), `Minaçu não pode ter ${c}`);
for (const c of MINACU) assert.ok(!textUru.includes(c), `Uruaçu não pode ter ${c}`);
assert.ok(!/1\.200|1200/.test(textMin), 'Minaçu sem o valor de Uruaçu (R$ 1.200 da AlvesCred)');
assert.equal(min.financeiro.entradas, 850);
assert.equal(min.financeiro.saidas, 180);
assert.equal(min.financeiro.saldoConta, 5670, 'saldo só do caixa de Minaçu (5000 + 850 − 180)');
assert.equal(uru.financeiro.entradas, 1200);
assert.equal(uru.financeiro.saidas, 0);
assert.deepEqual(min.financeiro.cobrancas, []);
assert.deepEqual(uru.financeiro.cobrancas.map((b) => b.cliente), ['Casa Lar', 'Padaria Pão Quente']);
assert.equal(specMin.title, 'Resumo do dia · Minaçu');
assert.equal(specUru.title, 'Resumo do dia · Uruaçu');
// quem trabalha nas duas aparece em cada uma só com o que fez para ela
const vMin = min.pessoas.find((p) => p.name === 'Victor');
const vUru = uru.pessoas.find((p) => p.name === 'Victor');
assert.match(vMin.items[0].text, /^1 gravação feita — Clínica Sorriso$/);
assert.match(vUru.items[0].text, /^1 gravação feita — Casa Lar$/);
assert.equal(min.numeros.gravacoes + uru.numeros.gravacoes, 2);
// agentes: só pelo que fizeram para a cidade (Beatriz só trabalhou na AlvesCred → só em Uruaçu); status sem cidade não entra
assert.ok(!min.pessoas.find((p) => p.name === 'Beatriz'));
assert.ok(uru.pessoas.find((p) => p.name === 'Beatriz'));
assert.ok(!min.pessoas.find((p) => p.name === 'Íris') && !uru.pessoas.find((p) => p.name === 'Íris'));
assert.deepEqual(uru.pendencias.atrasados.map((t) => t.cliente), ['Casa Lar']);
assert.deepEqual(min.pendencias.atrasados, []);
assert.deepEqual(min.porCliente.map((c) => c.cliente).sort(), ['Clínica Sorriso', 'Rede A3P']);
ok('por cidade: o de Minaçu não tem cliente nem valor de Uruaçu (e vice-versa); pessoas e agentes só com o que fizeram ali');

// exemplos: Uruaçu e Minaçu com financeiro (o que o Thiago e a Naay recebem) e Minaçu sem (o do Victor)
for (const f of fs.readdirSync(OUT).filter((n) => n.startsWith('resumo-do-dia-exemplo') && n.endsWith('.pdf'))) fs.unlinkSync(path.join(OUT, f));
const exemplo = (spec) => ({ ...spec, subtitle: `${spec.subtitle} · EXEMPLO COM DADOS FICTÍCIOS` });
fs.writeFileSync(path.join(OUT, 'resumo-do-dia-exemplo-uruacu.pdf'), await renderDailyPdf(exemplo(specUru)));
fs.writeFileSync(path.join(OUT, 'resumo-do-dia-exemplo-minacu.pdf'), await renderDailyPdf(exemplo(specMin)));
const minSem = await collectDayPdf(pool, ['minacu'], { financeiro: false });
const specMinSem = dailyPdfSpec(minSem, { financeiro: false });
assert.ok(!/Financeiro|Gasolina|850/.test(JSON.stringify(specMinSem)));
fs.writeFileSync(path.join(OUT, 'resumo-do-dia-exemplo-minacu-sem-financeiro.pdf'), await renderDailyPdf(exemplo(specMinSem)));
ok('exemplos gravados');

// ── envio: Thiago e Naay recebem as duas cidades, em mensagens separadas; Victor só Minaçu ──
const { createDailyReport } = await import('../assistant/dailyReport.mjs');
await pool.query(`UPDATE assistant_settings SET enabled = true`);
await pool.query(`INSERT INTO wa_connections (id, name, status, purposes) VALUES ('70000000-0000-0000-0000-000000000001', 'PULSE', 'conectada', '{assistente}')`);
await pool.query(`INSERT INTO assistant_numbers (name, phone, cities, permissions) VALUES
  ('Thiago', '5562999990001', '{minacu,uruacu}', '{resumo_diario,consultar_financeiro}'),
  ('Naay', '5562999990002', '{minacu,uruacu}', '{resumo_diario,consultar_financeiro}'),
  ('Victor', '5562999990003', '{minacu}', '{resumo_diario}')`);
const UP = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-resumo-'));
const r = await createDailyReport({ pool, uploadRoot: UP, publicUploadsUrl: 'https://agenciapulse.tech/uploads' }).runDaily({ force: true });
assert.equal(r.enviados, 3);
const { rows: out } = await pool.query(`SELECT to_number, body, media_url, media_name FROM wa_outbox ORDER BY to_number, created_at`);
const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date());
const by = (phone) => out.filter((o) => o.to_number === phone);
assert.deepEqual(by('5562999990001').map((o) => o.body).sort(), [`Resumo do dia ${dia} · Minaçu 📊`, `Resumo do dia ${dia} · Uruaçu 📊`].sort());
assert.deepEqual(by('5562999990002').map((o) => o.media_name).sort(), [`Resumo-do-dia-${dia.replace('/', '-')}-Minacu.pdf`, `Resumo-do-dia-${dia.replace('/', '-')}-Uruacu.pdf`].sort());
const victor = by('5562999990003');
assert.equal(victor.length, 1);
assert.equal(victor[0].body, `Resumo do dia ${dia} · Minaçu 📊`);
assert.ok(!/Urua/.test(JSON.stringify(victor)), 'nada de Uruaçu na mensagem do Victor');
const thiagoMin = by('5562999990001').find((o) => /Minaçu/.test(o.body)).media_url;
assert.notEqual(victor[0].media_url, thiagoMin, 'Victor: o PDF de Minaçu sem financeiro');
const files = fs.readdirSync(path.join(UP, 'resumos', fs.readdirSync(path.join(UP, 'resumos'))[0]));
assert.equal(files.length, 3, 'Uruaçu com financeiro, Minaçu com e Minaçu sem');
ok('envio: Thiago e Naay com 2 mensagens (uma por cidade), Victor só com a de Minaçu, sem financeiro');

photoServer.close();
console.log('\nTudo certo.');

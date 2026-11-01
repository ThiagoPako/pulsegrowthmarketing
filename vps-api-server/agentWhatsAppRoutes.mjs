// ─── WhatsApp pelos agentes (só a chefe) ────────────────────
// A chefe-agente (Marcely) manda uma arte, vídeo ou PDF ao grupo de WhatsApp de um cliente, pela mesma fila que o
// portal usa (enqueueWhatsApp, conexão com a função "geral" por padrão). Autenticação: "Authorization: Agent <chave>".
// Pedido do usuário em 30/10/2026 ("Use o sistema para enviar… crie a função"), restrito à chefe.
//
// Rotas:
//   GET  /api/agent/whatsapp/groups?client=      (chefe) clientes com grupo cadastrado (filtro por nome, opcional)
//   POST /api/agent/whatsapp/send                (chefe) multipart: file (PNG/JPG/WEBP/PDF/MP4, até 60 MB),
//        to (nome ou id do cliente), text, purpose (geral|aprovacao|assistente), confirm=1
//        Sem confirm=1 só responde o que seria enviado (cliente, grupo, conexão), sem pôr nada na fila.
//   POST /api/agent/whatsapp/team                (chefe, social_media) { to (nome de quem está no Assistente PULSE), text, confirm }:
//        aviso no privado de alguém da equipe pelo número do PULSE; sem confirm, só a prévia.
//
// Caixa da Marcely no WhatsApp (assistant/marcelyInbox.mjs; plano aprovado pelo usuário em 01/11/2026):
//   GET  /api/agent/inbox?status=nova|aberta|todas&marcar=1&limit=   (chefe) itens da caixa; aberta (padrão) = nova ou
//        lida sem resposta; marcar=1 marca as novas como lidas (sem ele só olha, como faz o `pulse esperar`)
//   POST /api/agent/inbox/:id/reply   { text }   (chefe) resposta a quem mandou (origem equipe), pelo número do PULSE
//   POST /api/agent/inbox/:id/done    { note }   (chefe) arquiva o item (resolvido, ou de grupo, que não tem resposta)
//   POST /api/agent/whatsapp/avisar   { text, options?, to?, preview? }  (chefe) aviso ao dono (permissão "decisoes_marcely")
//        quando algo precisa da decisão dele, ou a uma pessoa (to); options (2 a 12) vira enquete e o voto volta à caixa.
// Item de grupo de cliente não tem resposta por aqui: mensagem a cliente só com o ok do Thiago (POST .../send).
//
// Só manda para o grupo cadastrado de um cliente: número ou grupo digitado à mão não passa por aqui.

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { enqueueWhatsApp, normalizePoll } from './whatsapp/shared.mjs';
import { sendToNumber, remember, logEvent, clip } from './assistant/common.mjs';
import { ensureAssistantSchema } from './assistant/schema.mjs';
import { inboxView } from './assistant/marcelyInbox.mjs';

const MEDIA_EXT = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.pdf': 'pdf', '.mp4': 'mp4' };
const PURPOSES = new Set(['geral', 'aprovacao', 'assistente']);
const SIGNATURE = '\n\n— Marcely (agentes da Pulse)';
const AVISOS_POR_HORA = 20;

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// confere o começo do arquivo (não só a extensão)
function sniff(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (head.subarray(0, 4).toString() === '%PDF') return 'pdf';
  if (head.subarray(4, 8).toString() === 'ftyp') return 'mp4';
  return null;
}

export function registerAgentWhatsAppRoutes(app, { pool, uploadRoot, publicUploadsUrl, agentApi }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  const { verifyAgent } = agentApi;
  const dir = path.resolve(uploadRoot, 'whatsapp', 'agentes');

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 60 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (MEDIA_EXT[path.extname(file.originalname).toLowerCase()]) return cb(null, true);
      cb(Object.assign(new Error('Arquivo precisa ser PNG, JPG, WEBP, PDF ou MP4'), { status: 400 }));
    },
  }).single('file');

  async function chefe(req) {
    const agent = await verifyAgent(req);
    if (agent.role !== 'chefe') throw Object.assign(new Error('Só a chefe manda WhatsApp pelo sistema'), { status: 403 });
    return agent;
  }

  // aviso à equipe: a chefe e a social media (Ísis, 01/11/2026: artes de feriado que vencem em breve). Cliente, não.
  async function teamSender(req) {
    const agent = await verifyAgent(req);
    if (!['chefe', 'social_media'].includes(agent.role)) {
      throw Object.assign(new Error('Só a chefe e a social media avisam a equipe pelo WhatsApp'), { status: 403 });
    }
    return agent;
  }

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[agent-whatsapp] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function clientsWithGroup(filter) {
    const { rows } = await pool.query(
      `SELECT id, company_name, city, whatsapp_group FROM clients
        WHERE whatsapp_group IS NOT NULL AND trim(whatsapp_group) <> '' ORDER BY company_name`
    );
    const f = semAcento(filter);
    return f ? rows.filter((r) => semAcento(r.company_name).includes(f) || String(r.id) === String(filter).trim()) : rows;
  }

  app.get('/api/agent/whatsapp/groups', async (req, res) => {
    try {
      await chefe(req);
      const rows = await clientsWithGroup(req.query.client);
      res.json({ groups: rows.map((r) => ({ client_id: r.id, client: r.company_name, city: r.city, group: String(r.whatsapp_group).trim() })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/whatsapp/send', async (req, res) => {
    let agent;
    try {
      agent = await chefe(req);
    } catch (error) {
      return sendError(res, error);
    }
    upload(req, res, async (uploadError) => {
      const remove = () => { if (req.file?.path) fs.rm(req.file.path, { force: true }, () => {}); };
      try {
        if (uploadError) {
          throw Object.assign(new Error(uploadError.code === 'LIMIT_FILE_SIZE' ? 'Arquivo acima de 60 MB' : uploadError.message), { status: uploadError.status || 400 });
        }
        const to = String(req.body?.to || '').trim();
        const text = String(req.body?.text || '').trim().slice(0, 1500);
        const purpose = String(req.body?.purpose || 'geral').trim();
        const confirm = ['1', 'true', 'sim'].includes(String(req.body?.confirm || '').toLowerCase());
        if (!to) throw Object.assign(new Error('Diga o cliente (nome ou id) em "to"'), { status: 400 });
        if (!PURPOSES.has(purpose)) throw Object.assign(new Error(`Função da conexão: ${[...PURPOSES].join(', ')}`), { status: 400 });
        if (!req.file && !text) throw Object.assign(new Error('Mande um arquivo ou um texto'), { status: 400 });
        if (req.file) {
          const declared = MEDIA_EXT[path.extname(req.file.originalname).toLowerCase()];
          if (sniff(req.file.path) !== declared) throw Object.assign(new Error(`"${req.file.originalname}" não é um ${declared.toUpperCase()} válido`), { status: 400 });
        }

        const matches = await clientsWithGroup(to);
        const exact = matches.filter((m) => semAcento(m.company_name) === semAcento(to) || String(m.id) === to);
        const list = exact.length ? exact : matches;
        if (!list.length) throw Object.assign(new Error(`Nenhum cliente com grupo de WhatsApp cadastrado bate com "${to}" (veja pulse whatsapp grupos)`), { status: 404 });
        if (list.length > 1) {
          throw Object.assign(new Error(`"${to}" bate com ${list.length} clientes: ${list.map((m) => m.company_name).join(', ')}. Use o nome exato ou o id.`), { status: 409 });
        }
        const client = list[0];
        const group = String(client.whatsapp_group).trim();
        const preview = { client_id: client.id, client: client.company_name, city: client.city, group, purpose, text, file: req.file?.originalname || null };

        if (!confirm) {
          remove();
          return res.json({ dry_run: true, ...preview });
        }
        const mediaUrl = req.file ? `${uploadsBase}/${path.relative(path.resolve(uploadRoot), req.file.path).split(path.sep).join('/')}` : null;
        const queued = await enqueueWhatsApp(pool, {
          to: group, body: text, purpose, triggerType: 'agente_whatsapp', clientId: client.id, sentBy: agent.userId,
          mediaUrl, mediaName: req.file ? req.file.originalname.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) : null,
        });
        res.json({ success: true, status: 'fila', outbox_id: queued.id, ...preview, media_url: mediaUrl });
      } catch (error) {
        remove();
        sendError(res, error);
      }
    });
  });

  // Aviso a alguém da equipe no privado, pelo número do PULSE (pedido do usuário, 31/10/2026: "avisa a Naay pra ela
  // olhar o sistema"). Só para quem está cadastrado no Assistente PULSE (assistant_numbers ativo), pelo nome.
  //   POST /api/agent/whatsapp/team  { to (nome da pessoa), text, confirm }  — sem confirm, só a prévia
  app.post('/api/agent/whatsapp/team', async (req, res) => {
    try {
      const agent = await teamSender(req);
      const to = String(req.body?.to || '').trim();
      const text = String(req.body?.text || '').trim().slice(0, 1500);
      const confirm = ['1', 'true', 'sim'].includes(String(req.body?.confirm || '').toLowerCase());
      if (!to || !text) throw Object.assign(new Error('Diga a pessoa (to) e o texto (text)'), { status: 400 });
      const { rows } = await pool.query(`SELECT * FROM assistant_numbers WHERE active ORDER BY name`);
      const exact = rows.filter((n) => semAcento(n.name) === semAcento(to));
      const list = exact.length ? exact : rows.filter((n) => semAcento(n.name).includes(semAcento(to)));
      if (!list.length) throw Object.assign(new Error(`Ninguém da equipe com "${to}" no Assistente PULSE (${rows.map((n) => n.name).join(', ')})`), { status: 404 });
      if (list.length > 1) throw Object.assign(new Error(`"${to}" bate com ${list.map((n) => n.name).join(', ')}. Use o nome exato.`), { status: 409 });
      const number = list[0];
      const signature = agent.role === 'social_media' ? `${agent.name || 'Ísis'} (social media da Pulse)` : 'Marcely (agentes da Pulse)';
      const body = `${text}\n\n— ${signature}`;
      if (!confirm) return res.json({ dry_run: true, to: number.name, text: body });
      await sendToNumber(pool, number, body);
      await remember(pool, number.id, 'assistant', body);
      await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'aviso_agente', text: text.slice(0, 200), detail: { agente: agent.name || null } });
      res.json({ success: true, to: number.name, text: body });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Caixa da Marcely no WhatsApp ──
  const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
  async function inboxItem(id) {
    if (!isUuid(id)) throw Object.assign(new Error('id inválido'), { status: 400 });
    await ensureAssistantSchema(pool);
    const { rows: [item] } = await pool.query(`SELECT * FROM marcely_inbox WHERE id = $1`, [id]);
    if (!item) throw Object.assign(new Error('Item não encontrado na caixa'), { status: 404 });
    return item;
  }

  app.get('/api/agent/inbox', async (req, res) => {
    try {
      await chefe(req);
      await ensureAssistantSchema(pool);
      const status = ['nova', 'aberta', 'todas'].includes(req.query.status) ? req.query.status : 'aberta';
      const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
      const where = { nova: `status = 'nova'`, aberta: `status IN ('nova', 'lida')`, todas: 'true' }[status];
      const { rows } = await pool.query(
        `SELECT * FROM marcely_inbox WHERE ${where} ORDER BY created_at ${status === 'todas' ? 'DESC' : 'ASC'} LIMIT $1`, [limit]
      );
      if (['1', 'true', 'sim'].includes(String(req.query.marcar || '').toLowerCase())) {
        const novas = rows.filter((r) => r.status === 'nova').map((r) => r.id);
        if (novas.length) await pool.query(`UPDATE marcely_inbox SET status = 'lida', read_at = now() WHERE id = ANY($1) AND status = 'nova'`, [novas]);
      }
      res.json({ items: rows.map(inboxView) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/inbox/:id/reply', async (req, res) => {
    try {
      const agent = await chefe(req);
      const item = await inboxItem(req.params.id);
      const text = String(req.body?.text || '').trim().slice(0, 3500);
      if (!text) throw Object.assign(new Error('Escreva a resposta (text)'), { status: 400 });
      if (item.origem !== 'equipe' || !item.number_id) {
        throw Object.assign(new Error('Item de grupo de cliente não tem resposta por aqui: arquive (done) e, se for falar com o cliente, só com o ok do Thiago (pulse whatsapp enviar).'), { status: 409 });
      }
      const { rows: [number] } = await pool.query(`SELECT * FROM assistant_numbers WHERE id = $1 AND active`, [item.number_id]);
      if (!number) throw Object.assign(new Error('Quem mandou não está mais ativo no Assistente PULSE'), { status: 409 });
      const body = `${text}${SIGNATURE}`;
      await sendToNumber(pool, number, body);
      await remember(pool, number.id, 'assistant', body);
      await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'resposta_marcely', text: text.slice(0, 200), detail: { inbox_id: item.id, agente: agent.name || null } });
      const { rows: [saved] } = await pool.query(
        `UPDATE marcely_inbox SET status = 'respondida', replied_at = now(), read_at = coalesce(read_at, now()),
                reply = CASE WHEN reply IS NULL THEN $2 ELSE reply || E'\\n---\\n' || $2 END WHERE id = $1 RETURNING *`,
        [item.id, text]
      );
      res.json({ success: true, to: number.name, item: inboxView(saved) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/inbox/:id/done', async (req, res) => {
    try {
      await chefe(req);
      const item = await inboxItem(req.params.id);
      const note = clip(req.body?.note, 1000) || null;
      const { rows: [saved] } = await pool.query(
        `UPDATE marcely_inbox SET status = 'arquivada', read_at = coalesce(read_at, now()), note = coalesce($2, note) WHERE id = $1 RETURNING *`,
        [item.id, note]
      );
      res.json({ success: true, item: inboxView(saved) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Para quem vai o aviso de decisão (correção de 01/11/2026: o primeiro avisar foi a todos com "Falar com a Marcely",
  // e o usuário marcou essa permissão em mais gente da equipe). Padrão: só quem tem "decisoes_marcely" (o dono, o
  // Thiago). Sem ninguém marcado, só se houver um número com "marcely"; senão recusa, sem adivinhar.
  // `to` (nome) manda para uma pessoa só, entre quem fala com a Marcely.
  async function decisionTargets(to) {
    const { rows } = await pool.query(
      `SELECT * FROM assistant_numbers WHERE active AND permissions && '{marcely,decisoes_marcely}'::text[] ORDER BY name`
    );
    const name = String(to || '').trim();
    if (name) {
      const exact = rows.filter((n) => semAcento(n.name) === semAcento(name));
      const list = exact.length ? exact : rows.filter((n) => semAcento(n.name).includes(semAcento(name)));
      if (!list.length) throw Object.assign(new Error(`Ninguém com "${name}" fala com a Marcely no Assistente PULSE (${rows.map((n) => n.name).join(', ') || 'ninguém'})`), { status: 404 });
      if (list.length > 1) throw Object.assign(new Error(`"${name}" bate com ${list.map((n) => n.name).join(', ')}. Use o nome exato.`), { status: 409 });
      return list;
    }
    const owners = rows.filter((n) => (n.permissions || []).includes('decisoes_marcely'));
    if (owners.length) return owners;
    const talkers = rows.filter((n) => (n.permissions || []).includes('marcely'));
    if (talkers.length === 1) return talkers;
    throw Object.assign(new Error(talkers.length
      ? `Ninguém marcado para "Receber as decisões da Marcely" (Configurações → Assistente PULSE) e ${talkers.length} pessoas falam com ela (${talkers.map((n) => n.name).join(', ')}): marque o dono ou use --para <nome>`
      : 'Ninguém fala com a Marcely no Assistente PULSE (Configurações → Assistente PULSE)'), { status: 409 });
  }

  // Aviso ao dono (o Thiago, permissão "decisoes_marcely") quando algo precisa da decisão dele. Com opções vai uma
  // enquete; o voto chega como "Marcely, sobre …: <opção>" e cai direto na caixa (engine.mjs, callsMarcely).
  app.post('/api/agent/whatsapp/avisar', async (req, res) => {
    try {
      const agent = await chefe(req);
      await ensureAssistantSchema(pool);
      const text = String(req.body?.text || '').trim().slice(0, 3000);
      if (!text) throw Object.assign(new Error('Escreva o aviso (text)'), { status: 400 });
      const preview = ['1', 'true', 'sim'].includes(String(req.body?.preview || '').toLowerCase());
      let poll = null;
      const options = Array.isArray(req.body?.options) ? req.body.options : [];
      if (options.length) {
        const question = clip(req.body?.question || text.split('\n')[0], 120);
        try {
          poll = normalizePoll({
            name: question,
            options: options.map((o) => ({ label: o, answer: `Marcely, sobre "${clip(question, 80)}": ${clip(o, 100)}` })),
          });
        } catch (error) {
          throw Object.assign(new Error(error.message), { status: 400 });
        }
      }
      const numbers = await decisionTargets(req.body?.to);
      const body = `${text}${SIGNATURE}`;
      if (preview) return res.json({ dry_run: true, to: numbers.map((n) => n.name), text: body, poll });
      const { rows: [{ n }] } = await pool.query(
        `SELECT count(*)::int AS n FROM assistant_log WHERE kind = 'aviso_marcely' AND created_at > now() - interval '1 hour'`
      );
      if (n >= AVISOS_POR_HORA * numbers.length) throw Object.assign(new Error(`Limite de ${AVISOS_POR_HORA} avisos por hora: junte os assuntos numa mensagem só`), { status: 429 });
      for (const number of numbers) {
        await sendToNumber(pool, number, body, { poll });
        await remember(pool, number.id, 'assistant', poll ? `${body}\n[enquete enviada: ${poll.name} — opções: ${poll.options.map((o) => o.label).join(' | ')}]` : body);
        await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'aviso_marcely', text: text.slice(0, 200), detail: { agente: agent.name || null, enquete: !!poll } });
      }
      res.json({ success: true, to: numbers.map((n) => n.name), text: body, poll });
    } catch (error) {
      sendError(res, error);
    }
  });
}

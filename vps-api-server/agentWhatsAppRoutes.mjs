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
//
// Só manda para o grupo cadastrado de um cliente: número ou grupo digitado à mão não passa por aqui.

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { enqueueWhatsApp } from './whatsapp/shared.mjs';

const MEDIA_EXT = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp', '.pdf': 'pdf', '.mp4': 'mp4' };
const PURPOSES = new Set(['geral', 'aprovacao', 'assistente']);

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
}

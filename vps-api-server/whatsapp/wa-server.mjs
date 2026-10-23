// Processo do WhatsApp da Pulse (PM2: pulse-wa). Roda ao lado da API, separado dela: se o WhatsApp travar,
// o site continua no ar; e o deploy do site não derruba as conexões.
//
// Tudo passa pelo banco (ver shared.mjs):
//   wa_connections  conexões (número, funções, estado desejado, QR/código, status) — a tela de Configurações edita
//   wa_auth         sessão de cada número (criptografada), para reconectar sem ler o QR de novo
//   wa_outbox       fila de envio: este processo envia pela conexão certa, com intervalo entre mensagens
//   wa_inbound      mensagens recebidas (a API trata, ex.: resposta 1/2 da confirmação de gravação)
//
// Cuidados que o motor tem (aprendidos com o WA-AKG e com a Baileys):
//   - sem baixar o histórico do número ao conectar (pesaria na VPS);
//   - cada motivo de queda tratado do seu jeito (saiu no celular, sessão substituída, reinício pedido, rede);
//   - escrita das chaves em transação e uma por vez por conexão (evita sessão corrompida / "Bad MAC");
//   - número brasileiro conferido no WhatsApp com e sem o 9º dígito antes de enviar;
//   - um único processo por vez (trava no Postgres): dois processos com o mesmo número se derrubariam.

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  Browsers,
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  initAuthCreds,
  isJidBroadcast,
  jidDecode,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  proto,
} from 'baileys';
import { ensureWhatsAppSchema, isGroupTarget } from './shared.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

const pgUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pgPassword = process.env.PG_PASSWORD ?? process.env.PGPASSWORD ?? process.env.DB_PASSWORD;
const pool = pgUrl
  ? new pg.Pool({ connectionString: pgUrl, max: 5 })
  : new pg.Pool({
      host: process.env.PG_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.PG_PORT || process.env.PGPORT) || 5432,
      database: process.env.PG_DATABASE || process.env.PGDATABASE || process.env.DB_NAME || 'pulse_db',
      user: process.env.PG_USER || process.env.PGUSER || process.env.DB_USER || 'pulse_user',
      ...(typeof pgPassword === 'string' && pgPassword.length > 0 ? { password: pgPassword } : {}),
      max: 5,
    });

const log = (...a) => console.log(new Date().toISOString(), '[wa]', ...a);
const baileysLogger = pino({ level: process.env.WA_LOG_LEVEL || 'error' });

const TICK_MS = 3000;
const SEND_GAP_MIN_MS = Number(process.env.WA_SEND_GAP_MIN_MS) || 4000; // intervalo entre mensagens da mesma conexão
const SEND_GAP_MAX_MS = Number(process.env.WA_SEND_GAP_MAX_MS) || 9000;
const MAX_ATTEMPTS = 5;
const QUEUE_TTL_H = 48; // mensagem que não saiu em 48 h (sem conexão para a função) não vale mais
const QR_TIMEOUT_MS = 3 * 60 * 1000;
const MEDIA_MAX_BYTES = 32 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // vídeo vai por streaming (não carrega o arquivo inteiro na memória)
const GROUPS_REFRESH_MS = 30 * 60 * 1000;

// ── Criptografia da sessão (AES-256-GCM) ───────────────────────
const secret = process.env.WA_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!secret) log('AVISO: sem WA_ENCRYPTION_KEY nem JWT_SECRET; a sessão fica com chave fraca');
const KEY = crypto.createHash('sha256').update(String(secret || 'pulse-wa-sem-chave')).digest();
const encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};
const decrypt = (value) => {
  const [v, iv, tag, data] = String(value).split(':');
  if (v !== 'v1') throw new Error('formato de sessão desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
};

// ── Sessão no Postgres ─────────────────────────────────────────
function makeMutex() {
  let last = Promise.resolve();
  return (fn) => {
    const run = last.then(fn, fn);
    last = run.catch(() => {});
    return run;
  };
}

async function usePgAuthState(connectionId) {
  const lock = makeMutex();
  const read = async (key) => {
    const { rows } = await pool.query('SELECT value FROM wa_auth WHERE connection_id = $1 AND key = $2', [connectionId, key]);
    return rows.length ? JSON.parse(decrypt(rows[0].value), BufferJSON.reviver) : null;
  };
  const writeMany = (entries) => lock(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        if (value === null || value === undefined) {
          await client.query('DELETE FROM wa_auth WHERE connection_id = $1 AND key = $2', [connectionId, key]);
        } else {
          await client.query(
            `INSERT INTO wa_auth (connection_id, key, value, updated_at) VALUES ($1, $2, $3, now())
             ON CONFLICT (connection_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [connectionId, key, encrypt(JSON.stringify(value, BufferJSON.replacer))]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  const creds = (await read('creds')) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const keys = ids.map((id) => `${type}-${id}`);
          const { rows } = await pool.query(
            'SELECT key, value FROM wa_auth WHERE connection_id = $1 AND key = ANY($2)',
            [connectionId, keys]
          );
          const found = new Map(rows.map((r) => [r.key, r.value]));
          const out = {};
          for (const id of ids) {
            const raw = found.get(`${type}-${id}`);
            if (!raw) continue;
            let value = JSON.parse(decrypt(raw), BufferJSON.reviver);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            out[id] = value;
          }
          return out;
        },
        set: async (data) => {
          const entries = [];
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) entries.push([`${type}-${id}`, data[type][id]]);
          }
          if (entries.length) await writeMany(entries);
        },
      },
    },
    saveCreds: () => writeMany([['creds', creds]]),
  };
}

const wipeAuth = (connectionId) => pool.query('DELETE FROM wa_auth WHERE connection_id = $1', [connectionId]);

const setConn = (id, fields) => {
  const keys = Object.keys(fields);
  if (!keys.length) return Promise.resolve();
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  return pool.query(`UPDATE wa_connections SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
};

// cache simples exigido pela Baileys para reenvio de mensagens que o destinatário não conseguiu abrir
const memoryCache = () => {
  const m = new Map();
  return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); return true; }, del: (k) => m.delete(k), flushAll: () => m.clear() };
};

let waVersion = null;
async function baileysVersion() {
  if (waVersion) return waVersion;
  try {
    const { version } = await fetchLatestBaileysVersion();
    waVersion = version;
  } catch {
    waVersion = undefined; // a Baileys usa a versão embutida
  }
  return waVersion;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (v) => String(v || '').replace(/\D/g, '');

// ── Uma conexão (um número) ────────────────────────────────────
class Connection {
  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.purposes = row.purposes || [];
    this.sock = null;
    this.state = 'parada'; // parada | iniciando | qr | conectada | reconectando
    this.retries = 0;
    this.stopping = false;
    this.qrSince = null;
    this.pairPhone = row.pair_phone || null;
    this.pairRequested = false;
    this.nextSendAt = 0;
    this.busy = false;
    this.sent = new Map(); // id → mensagem enviada (para reenvio)
    this.retryCache = memoryCache();
    this.restartTimer = null;
  }

  async start() {
    if (this.sock || this.state === 'iniciando') return;
    this.state = 'iniciando';
    this.stopping = false;
    clearTimeout(this.restartTimer);
    await setConn(this.id, { status: this.retries ? 'reconectando' : 'conectando', last_error: null });
    try {
      const { state, saveCreds } = await usePgAuthState(this.id);
      this.registered = !!state.creds.registered;
      const sock = makeWASocket({
        version: await baileysVersion(),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
        logger: baileysLogger,
        browser: Browsers.appropriate('Pulse Sistema'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        connectTimeoutMs: 30_000,
        keepAliveIntervalMs: 25_000,
        msgRetryCounterCache: this.retryCache,
        getMessage: async (key) => this.sent.get(key.id),
        shouldIgnoreJid: (jid) => isJidBroadcast(jid) || String(jid).endsWith('@newsletter'),
      });
      this.sock = sock;
      sock.ev.on('creds.update', () => saveCreds().catch((e) => log(this.name, 'creds:', e.message)));
      sock.ev.on('connection.update', (u) => this.onUpdate(sock, u).catch((e) => log(this.name, 'update:', e.message)));
      sock.ev.on('messages.upsert', (m) => this.onMessages(sock, m).catch((e) => log(this.name, 'recebida:', e.message)));
      // entrou/saiu de grupo ou mudou o nome: atualiza a lista
      const resyncGroups = () => {
        clearTimeout(this.groupsTimer);
        this.groupsTimer = setTimeout(() => this.syncGroups().catch(() => {}), 10_000);
      };
      sock.ev.on('groups.upsert', resyncGroups);
      sock.ev.on('groups.update', resyncGroups);
      sock.ev.on('group-participants.update', resyncGroups);
    } catch (error) {
      this.sock = null;
      this.state = 'parada';
      log(this.name, 'falha ao iniciar:', error.message);
      await this.scheduleRestart(`falha ao iniciar: ${error.message}`);
    }
  }

  async onUpdate(sock, update) {
    if (sock !== this.sock) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (this.pairPhone && !this.pairRequested) {
        // conexão por código (sem câmera): pede o código de 8 letras para digitar no celular
        this.pairRequested = true;
        try {
          const code = await sock.requestPairingCode(digits(this.pairPhone));
          this.state = 'qr';
          this.qrSince = Date.now();
          await setConn(this.id, { status: 'codigo', pairing_code: code, qr: null, qr_image: null });
        } catch (error) {
          await setConn(this.id, { last_error: `Não consegui gerar o código: ${error.message}` });
        }
      } else if (!this.pairPhone) {
        this.state = 'qr';
        if (!this.qrSince) this.qrSince = Date.now();
        const image = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        await setConn(this.id, { status: 'qr', qr, qr_image: image, pairing_code: null });
      }
      if (this.qrSince && Date.now() - this.qrSince > QR_TIMEOUT_MS) {
        await this.stop('desligada');
        await this.halt({ status: 'desconectada', last_error: 'O QR/código expirou sem leitura. Clique em Conectar para gerar outro.' });
      }
    }

    if (connection === 'open') {
      this.state = 'conectada';
      this.retries = 0;
      this.qrSince = null;
      this.pairPhone = null;
      const me = sock.user || {};
      await setConn(this.id, {
        status: 'conectada', qr: null, qr_image: null, pairing_code: null, pair_phone: null, last_error: null,
        phone: jidDecode(me.id)?.user || null, push_name: me.name || me.notify || null,
        connected_at: new Date(), last_seen_at: new Date(),
      });
      this.phone = jidDecode(me.id)?.user || null;
      log(this.name, 'conectada como', this.phone);
      setTimeout(() => this.syncGroups().catch((e) => log(this.name, 'grupos:', e.message)), 5000);
    }

    if (connection === 'close') {
      this.sock = null;
      this.state = 'parada';
      try { sock.ev.removeAllListeners(); } catch {}
      if (this.stopping) return;
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || String(code || '');
      if (code === DisconnectReason.loggedOut) {
        this.state = 'final';
        await wipeAuth(this.id);
        await this.halt({ status: 'desconectada', phone: null,
          last_error: 'O número saiu do sistema (desconectado no celular). Clique em Conectar e leia o QR de novo.' });
        log(this.name, 'saiu no celular');
        return;
      }
      if (code === DisconnectReason.badSession) {
        this.state = 'final';
        await wipeAuth(this.id);
        await this.halt({ status: 'desconectada', last_error: 'Sessão corrompida: conecte de novo pelo QR.' });
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        await this.halt({ status: 'erro',
          last_error: 'Esta conexão foi aberta em outro lugar com a mesma sessão. Desligada para não ficar se derrubando.' });
        return;
      }
      if (code === DisconnectReason.forbidden || code === DisconnectReason.multideviceMismatch) {
        await this.halt({ status: 'erro', last_error: `O WhatsApp recusou a conexão (${code}). Pode ser bloqueio do número.` });
        return;
      }
      if (code === DisconnectReason.restartRequired) {
        // normal logo depois de ler o QR: reconecta na hora
        return this.start();
      }
      if (!this.registered && this.qrSince && Date.now() - this.qrSince > QR_TIMEOUT_MS) {
        await this.halt({ status: 'desconectada', last_error: 'O QR/código expirou sem leitura. Clique em Conectar para gerar outro.' });
        return;
      }
      if (!this.registered && this.qrSince) {
        // QR ainda válido: a Baileys fecha e reabre para gerar o próximo; reconecta já
        return this.start();
      }
      await this.scheduleRestart(reason);
    }
  }

  // queda definitiva (saiu no celular, QR expirou, sessão substituída…): fica parada até alguém clicar em Conectar
  async halt(fields) {
    this.state = 'final';
    this.qrSince = null;
    clearTimeout(this.restartTimer);
    await setConn(this.id, { desired: 'desligada', qr: null, qr_image: null, pairing_code: null, ...fields });
  }

  async scheduleRestart(reason) {
    this.retries += 1;
    const delay = Math.min(300, 2 ** Math.min(this.retries, 8)) * 1000;
    this.state = 'reconectando';
    await setConn(this.id, { status: 'reconectando', last_error: `Caiu (${reason}); tento de novo em ${Math.round(delay / 1000)} s` });
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this.start().catch(() => {}), delay);
  }

  async stop(status = 'desligada', error = null) {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    const sock = this.sock;
    this.sock = null;
    this.state = 'parada';
    try { sock?.ev.removeAllListeners(); } catch {}
    try { sock?.end(undefined); } catch {}
    await setConn(this.id, { status, qr: null, qr_image: null, pairing_code: null, ...(error ? { last_error: error } : {}) }).catch(() => {});
  }

  async logout() {
    this.stopping = true;
    try { await this.sock?.logout(); } catch {}
    await this.stop('desconectada');
    await wipeAuth(this.id);
    await pool.query('DELETE FROM wa_groups WHERE connection_id = $1', [this.id]).catch(() => {});
    this.state = 'final';
    await setConn(this.id, { phone: null, push_name: null, connected_at: null, desired: 'desligada' });
  }

  async onMessages(sock, { messages, type }) {
    if (type !== 'notify') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      if (!jid || msg.key.fromMe || isJidBroadcast(jid) || jid.endsWith('@newsletter')) continue;
      const isGroup = jid.endsWith('@g.us');
      const content = normalizeMessageContent(msg.message);
      if (!content) continue;
      const text = content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption
        || content.videoMessage?.caption || content.buttonsResponseMessage?.selectedDisplayText
        || content.listResponseMessage?.title || content.templateButtonReplyMessage?.selectedDisplayText || '';
      if (!text) continue;
      // quem escreveu: no privado é o próprio chat; no grupo é o participante
      const senderJid = isGroup ? (msg.key.participant || '') : jid;
      let phone = null;
      if (senderJid.endsWith('@s.whatsapp.net')) phone = jidDecode(senderJid)?.user || null;
      else if (senderJid.endsWith('@lid')) {
        // contas novas chegam com um id interno (LID): pega o número de telefone correspondente
        const alt = isGroup ? (msg.key.participantAlt || msg.participantPn) : (msg.key.remoteJidAlt || msg.key.senderPn);
        if (alt) phone = jidDecode(alt)?.user || digits(alt);
        if (!phone) {
          try { phone = jidDecode(await sock.signalRepository?.lidMapping?.getPNForLID?.(senderJid))?.user || null; } catch {}
        }
      }
      // mensagem de outro número da própria agência (ex.: aviso no grupo) não é resposta de cliente
      if (phone && [...connections.values()].some((c) => c.phone && c.phone === phone)) continue;
      await pool.query(
        `INSERT INTO wa_inbound (connection_id, wa_id, from_jid, phone, push_name, text, group_jid) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [this.id, msg.key.id, senderJid || jid, phone, msg.pushName || null, text.slice(0, 4000), isGroup ? jid : null]
      );
    }
  }

  // grupos em que este número está → wa_groups (a fila usa para mandar no grupo pelo número que está nele)
  async syncGroups() {
    if (!this.sock || this.state !== 'conectada') return;
    this.groupsSyncedAt = Date.now();
    const all = await this.sock.groupFetchAllParticipating();
    const groups = Object.values(all || {});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM wa_groups WHERE connection_id = $1', [this.id]);
      for (const g of groups) {
        await client.query(
          `INSERT INTO wa_groups (connection_id, jid, subject, size, updated_at) VALUES ($1, $2, $3, $4, now())`,
          [this.id, g.id, g.subject || null, Array.isArray(g.participants) ? g.participants.length : null]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  // número/grupo do destino → jid do WhatsApp (com e sem o 9º dígito no Brasil)
  async resolveJid(to) {
    const raw = String(to || '').trim();
    if (raw.endsWith('@g.us') || raw.endsWith('@s.whatsapp.net')) return raw;
    const invite = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    if (invite) {
      const cacheKey = `grupo:${invite[1]}`;
      const { rows } = await pool.query('SELECT jid FROM wa_jid_cache WHERE number = $1', [cacheKey]);
      if (rows[0]?.jid) return rows[0].jid;
      const info = await this.sock.groupGetInviteInfo(invite[1]);
      await pool.query(
        `INSERT INTO wa_jid_cache (number, jid, on_whatsapp) VALUES ($1, $2, true)
         ON CONFLICT (number) DO UPDATE SET jid = EXCLUDED.jid, on_whatsapp = true, checked_at = now()`,
        [cacheKey, info.id]
      );
      return info.id;
    }
    let d = digits(raw);
    if (d.length === 10 || d.length === 11) d = `55${d}`;
    if (d.length < 10) throw Object.assign(new Error(`Número inválido: ${raw}`), { permanent: true });
    const { rows } = await pool.query(
      `SELECT jid, on_whatsapp FROM wa_jid_cache WHERE number = $1 AND checked_at > now() - interval '30 days'`, [d]
    );
    if (rows.length) {
      if (!rows[0].on_whatsapp) throw Object.assign(new Error(`Número sem WhatsApp: ${d}`), { permanent: true });
      return rows[0].jid;
    }
    const candidates = [d];
    if (d.startsWith('55') && d.length === 13 && d[4] === '9') candidates.push(d.slice(0, 4) + d.slice(5));
    if (d.startsWith('55') && d.length === 12) candidates.push(`${d.slice(0, 4)}9${d.slice(4)}`);
    const results = (await this.sock.onWhatsApp(...candidates)) || [];
    const hit = results.find((r) => r?.exists);
    await pool.query(
      `INSERT INTO wa_jid_cache (number, jid, on_whatsapp) VALUES ($1, $2, $3)
       ON CONFLICT (number) DO UPDATE SET jid = EXCLUDED.jid, on_whatsapp = EXCLUDED.on_whatsapp, checked_at = now()`,
      [d, hit?.jid || null, !!hit]
    );
    if (!hit) throw Object.assign(new Error(`Número sem WhatsApp: ${d}`), { permanent: true });
    return hit.jid;
  }

  async buildContent(row) {
    if (!row.media_url) return { text: row.body };
    // confere tipo e tamanho antes; a Baileys baixa e envia em streaming a partir da URL
    let mimetype = 'application/octet-stream';
    let size = 0;
    try {
      const head = await fetch(row.media_url, { method: 'HEAD' });
      if (head.ok) {
        mimetype = (head.headers.get('content-type') || mimetype).split(';')[0];
        size = Number(head.headers.get('content-length') || 0);
      } else if (head.status === 404 || head.status === 410) {
        throw Object.assign(new Error(`Arquivo não encontrado (${head.status})`), { permanent: true });
      }
    } catch (error) {
      if (error.permanent) throw error;
    }
    const url = row.media_url;
    const fileName = row.media_name || decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'arquivo');
    if (mimetype === 'application/octet-stream') {
      const ext = fileName.split('.').pop()?.toLowerCase();
      mimetype = { mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }[ext] || mimetype;
    }
    const caption = row.body || undefined;
    if (mimetype.startsWith('video/')) {
      if (size > VIDEO_MAX_BYTES) throw Object.assign(new Error('Vídeo maior que 100 MB'), { permanent: true });
      return { video: { url }, caption, mimetype: mimetype === 'video/quicktime' ? 'video/mp4' : mimetype };
    }
    if (size > MEDIA_MAX_BYTES) throw Object.assign(new Error('Arquivo maior que 32 MB'), { permanent: true });
    if (mimetype.startsWith('image/') && mimetype !== 'image/gif') return { image: { url }, caption, mimetype };
    return { document: { url }, mimetype, fileName, caption };
  }

  async send(row) {
    const jid = row._jid || await this.resolveJid(row.to_number);
    const content = await this.buildContent(row);
    try {
      await this.sock.sendPresenceUpdate('composing', jid);
      await sleep(1200 + Math.random() * 1800);
      await this.sock.sendPresenceUpdate('paused', jid);
    } catch {}
    const result = await this.sock.sendMessage(jid, content);
    if (result?.key?.id && result.message) {
      this.sent.set(result.key.id, result.message);
      if (this.sent.size > 500) this.sent.delete(this.sent.keys().next().value);
    }
    return { jid, waId: result?.key?.id || null };
  }
}

// ── Gerente: liga/desliga conexões conforme o banco e despacha a fila ──
const connections = new Map();

async function syncConnections() {
  const { rows } = await pool.query('SELECT * FROM wa_connections ORDER BY created_at');
  const seen = new Set();
  for (const row of rows) {
    seen.add(row.id);
    let c = connections.get(row.id);
    if (!c) {
      c = new Connection(row);
      connections.set(row.id, c);
    }
    c.name = row.name;
    c.purposes = row.purposes || [];
    if (row.phone) c.phone = row.phone;
    if (row.command) {
      const command = row.command;
      await pool.query('UPDATE wa_connections SET command = NULL WHERE id = $1', [row.id]);
      if (command === 'sair') {
        await c.logout();
        continue;
      }
      if (command === 'reconectar') {
        await c.stop('conectando');
        c.state = 'parada';
        c.retries = 0;
        c.qrSince = null;
        c.pairPhone = row.pair_phone || null;
        c.pairRequested = false;
        c.stopping = false;
      }
    }
    if (row.desired === 'ligada' && !c.sock && c.state === 'parada') {
      c.pairPhone = row.pair_phone || c.pairPhone;
      await c.start();
    } else if (row.desired !== 'ligada' && (c.sock || ['iniciando', 'qr', 'conectada', 'reconectando'].includes(c.state))) {
      clearTimeout(c.restartTimer);
      c.restartTimer = null;
      await c.stop('desligada');
    }
  }
  for (const [id, c] of connections) {
    if (!seen.has(id)) {
      // conexão apagada na tela: sai do WhatsApp e apaga a sessão
      await c.logout().catch(() => {});
      connections.delete(id);
    }
  }
}

function pickConnection(row, ready) {
  if (row.connection_id) return ready.find((c) => c.id === row.connection_id) || null;
  const own = ready.filter((c) => c.purposes.includes(row.purpose));
  const pool_ = own.length ? own : ready.filter((c) => c.purposes.includes('geral'));
  if (!pool_.length) return null;
  return pool_.reduce((a, b) => (a.nextSendAt <= b.nextSendAt ? a : b));
}

async function finish(row, fields, logStatus, apiResponse) {
  const keys = Object.keys(fields);
  await pool.query(
    `UPDATE wa_outbox SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [row.id, ...keys.map((k) => fields[k])]
  );
  if (row.log_id && logStatus) {
    await pool.query('UPDATE whatsapp_messages SET status = $2, api_response = $3::jsonb WHERE id = $1',
      [row.log_id, logStatus, JSON.stringify(apiResponse || {})]).catch(() => {});
  }
}

// link de convite ou jid → jid do grupo (cacheado em wa_jid_cache como "grupo:<código>")
async function resolveGroupJid(to, conn) {
  const raw = String(to || '').trim();
  if (raw.endsWith('@g.us')) return raw;
  const invite = raw.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i);
  if (!invite) throw new Error(raw);
  const cacheKey = `grupo:${invite[1]}`;
  const { rows } = await pool.query('SELECT jid FROM wa_jid_cache WHERE number = $1', [cacheKey]);
  if (rows[0]?.jid) return rows[0].jid;
  const info = await conn.sock.groupGetInviteInfo(invite[1]);
  await pool.query(
    `INSERT INTO wa_jid_cache (number, jid, on_whatsapp) VALUES ($1, $2, true)
     ON CONFLICT (number) DO UPDATE SET jid = EXCLUDED.jid, on_whatsapp = true, checked_at = now()`,
    [cacheKey, info.id]
  );
  return info.id;
}

async function dispatch() {
  // mensagens presas em "enviando" (processo reiniciou no meio) voltam para a fila
  await pool.query(`UPDATE wa_outbox SET status = 'fila' WHERE status = 'enviando' AND next_try_at < now() - interval '5 minutes'`);
  // velhas demais: não envia mais
  const { rows: expired } = await pool.query(
    `UPDATE wa_outbox SET status = 'falhou', error = 'Expirou na fila (${QUEUE_TTL_H} h sem conexão conectada com esta função)'
      WHERE status = 'fila' AND created_at < now() - interval '${QUEUE_TTL_H} hours' RETURNING id, log_id`
  );
  for (const r of expired) {
    if (r.log_id) await pool.query(`UPDATE whatsapp_messages SET status = 'failed' WHERE id = $1`, [r.log_id]).catch(() => {});
  }

  const all = [...connections.values()];
  const ready = all.filter((c) => c.state === 'conectada' && c.sock && !c.busy && Date.now() >= c.nextSendAt);
  if (!ready.length) return;
  const { rows } = await pool.query(
    `SELECT * FROM wa_outbox WHERE status = 'fila' AND next_try_at <= now() ORDER BY created_at LIMIT 50`
  );
  for (const row of rows) {
    const free = ready.filter((c) => !c.busy && Date.now() >= c.nextSendAt);
    if (!free.length) break;
    let conn;
    if (isGroupTarget(row.to_number) && !row.connection_id) {
      // grupo: só pode mandar um número que está no grupo (de preferência o que tem a função)
      let groupJid;
      try {
        groupJid = await resolveGroupJid(row.to_number, free[0]);
      } catch (error) {
        await finish(row, { status: 'falhou', error: `Grupo inválido: ${error.message}` }, 'failed', { purpose: row.purpose, error: error.message });
        continue;
      }
      const { rows: members } = await pool.query('SELECT connection_id FROM wa_groups WHERE jid = $1', [groupJid]);
      const memberIds = new Set(members.map((m) => m.connection_id));
      if (!memberIds.size) {
        await finish(row, { status: 'falhou', error: 'Nenhum número conectado está neste grupo: adicione ao grupo o número que envia esta função' },
          'failed', { purpose: row.purpose, error: 'fora_do_grupo', group: groupJid });
        continue;
      }
      const inGroup = free.filter((c) => memberIds.has(c.id));
      conn = inGroup.find((c) => c.purposes.includes(row.purpose)) || inGroup.find((c) => c.purposes.includes('geral')) || null;
      if (!conn) continue; // quem está no grupo está ocupado ou desconectado: espera
      row._jid = groupJid;
    } else {
      // sem conexão para a função (nem "geral"): espera na fila — sai quando alguém conectar um número com a função,
      // ou falha ao completar 48 h (ver QUEUE_TTL_H)
      conn = pickConnection(row, free);
    }
    if (!conn) continue;
    const { rowCount } = await pool.query(
      `UPDATE wa_outbox SET status = 'enviando', connection_id = $2, attempts = attempts + 1, next_try_at = now()
        WHERE id = $1 AND status = 'fila'`, [row.id, conn.id]
    );
    if (!rowCount) continue;
    conn.busy = true;
    conn.send(row)
      .then(async ({ jid, waId }) => {
        await finish(row, { status: 'enviada', jid, wa_id: waId, sent_at: new Date(), error: null }, 'sent',
          { purpose: row.purpose, connection: conn.name, jid, id: waId });
      })
      .catch(async (error) => {
        const attempts = (row.attempts || 0) + 1;
        if (error.permanent || attempts >= MAX_ATTEMPTS) {
          await finish(row, { status: 'falhou', error: error.message }, 'failed', { purpose: row.purpose, connection: conn.name, error: error.message });
        } else {
          await finish(row, { status: 'fila', connection_id: row.connection_id || null, error: error.message,
            next_try_at: new Date(Date.now() + 30_000 * attempts) }, null);
        }
        log(conn.name, 'falha no envio:', error.message);
      })
      .finally(() => {
        conn.busy = false;
        conn.nextSendAt = Date.now() + SEND_GAP_MIN_MS + Math.random() * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS);
      });
  }
}

let lastHeartbeat = 0;
let lastCleanup = 0;
async function housekeeping() {
  if (Date.now() - lastHeartbeat > 20_000) {
    lastHeartbeat = Date.now();
    await pool.query(
      `INSERT INTO wa_engine (id, seen_at, version) VALUES (1, now(), $1)
       ON CONFLICT (id) DO UPDATE SET seen_at = now(), version = EXCLUDED.version`, [process.version]
    );
    const ids = [...connections.values()].filter((c) => c.state === 'conectada').map((c) => c.id);
    if (ids.length) await pool.query('UPDATE wa_connections SET last_seen_at = now() WHERE id = ANY($1)', [ids]);
  }
  for (const c of connections.values()) {
    if (c.state === 'conectada' && (!c.groupsSyncedAt || Date.now() - c.groupsSyncedAt > GROUPS_REFRESH_MS)) {
      c.syncGroups().catch((e) => log(c.name, 'grupos:', e.message));
    }
  }
  if (Date.now() - lastCleanup > 6 * 3600_000) {
    lastCleanup = Date.now();
    await pool.query(`DELETE FROM wa_outbox WHERE status IN ('enviada', 'falhou') AND created_at < now() - interval '30 days'`);
    await pool.query(`DELETE FROM wa_inbound WHERE handled_at IS NOT NULL AND received_at < now() - interval '30 days'`);
  }
}

// ── Um processo por vez ────────────────────────────────────────
async function acquireLock() {
  const client = await pool.connect();
  for (;;) {
    const { rows } = await client.query(`SELECT pg_try_advisory_lock(hashtext('pulse-wa-engine')) AS ok`);
    if (rows[0].ok) return client; // a trava vale enquanto esta conexão do banco existir
    log('outro processo do WhatsApp está rodando; espero 15 s');
    await sleep(15_000);
  }
}

let running = true;
let lockClient = null;
async function main() {
  await ensureWhatsAppSchema(pool);
  lockClient = await acquireLock();
  lockClient.on('error', (e) => { log('perdi a trava do banco:', e.message); process.exit(1); });
  log('processo do WhatsApp no ar');
  while (running) {
    try {
      await syncConnections();
      await dispatch();
      await housekeeping();
    } catch (error) {
      log('ciclo:', error.message);
    }
    await sleep(TICK_MS);
  }
}

async function shutdown(signal) {
  log(`encerrando (${signal})`);
  running = false;
  setTimeout(() => process.exit(0), 5000).unref(); // nunca fica preso no encerramento
  for (const c of connections.values()) {
    const wasUp = c.state === 'conectada';
    c.stopping = true;
    try { c.sock?.end(undefined); } catch {}
    if (wasUp) await setConn(c.id, { status: 'reconectando' }).catch(() => {});
  }
  try { lockClient?.release(); } catch {}
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => log('promessa sem tratamento:', e?.message || e));

main().catch((error) => {
  log('falha fatal:', error);
  process.exit(1);
});

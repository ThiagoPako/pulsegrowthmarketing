// ─── Efí Bank (ex-Gerencianet): API Pix das mensalidades (pedido do usuário, 02/11/2026: "Vou trocar de banco, usar
// o Efí"). Documentação oficial: https://dev.efipay.com.br/docs/api-pix (credenciais, cobranças imediatas, webhooks,
// gestão de Pix, endpoints exclusivos). O que vale daqui:
//   Base: produção https://pix.api.efipay.com.br · homologação https://pix-h.api.efipay.com.br
//   Toda chamada (inclusive o token) vai com o certificado .p12 da conta (mTLS, senha vazia); cada ambiente tem o
//   seu certificado e o seu par Client_Id/Client_Secret.
//   POST /oauth/token  Basic base64(client_id:client_secret), { grant_type: 'client_credentials' } → access_token,
//                      expires_in (3600), scope (lista separada por espaço)
//   PUT  /v2/cob/:txid { calendario: { expiracao }, valor: { original }, chave, solicitacaoPagador, infoAdicionais }
//                      → { txid, loc: { id }, status: 'ATIVA', pixCopiaECola }            (escopo cob.write)
//   GET  /v2/cob/:txid → status ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP, pix[] (cob.read)
//   GET  /v2/loc/:id/qrcode → { qrcode, imagemQrcode, linkVisualizacao }                  (payloadlocation.read)
//   GET  /v2/pix?inicio&fim → { parametros: { paginacao }, pix: [{ endToEndId, txid, valor, horario, pagador,
//                      infoPagador, devolucoes }] }                                         (pix.read)
//   GET  /v2/gn/saldo/ → { saldo }                                                          (gn.balance.read)
//   PUT  /v2/webhook/:chave { webhookUrl } (webhook.write) · GET /v2/webhook/:chave (webhook.read). A Efí acrescenta
//                      "/pix" ao fim da URL, a não ser que ela termine em "?ignorar="; o servidor que recebe precisa
//                      de mTLS (cadeia da Efí) e a doc recomenda também um hmac na URL e o IP 34.193.116.226.
// Por que cob e não cobv: a cobv exige o devedor (CPF/CNPJ e nome) e o sistema não guarda o documento dos clientes.
// A cob sai sem devedor e vale até o vencimento + 30 dias (calendario.expiracao, em segundos).
// Em homologação a Efí só confirma (e notifica) cobranças de R$ 0,01 a R$ 10,00.

import crypto from 'node:crypto';
import https from 'node:https';
import tls from 'node:tls';

export const EFI_PIX_BASE = {
  producao: 'https://pix.api.efipay.com.br',
  homologacao: 'https://pix-h.api.efipay.com.br',
};
export const EFI_ENVS = Object.keys(EFI_PIX_BASE);
export const EFI_WEBHOOK_IP = '34.193.116.226';

/** Escopos que a aplicação da Efí precisa ter (o saldo é opcional: sem ele, só não mostra o saldo). */
export const EFI_SCOPES_REQUIRED = ['cob.write', 'cob.read', 'pix.read', 'webhook.write', 'webhook.read', 'payloadlocation.read'];
export const EFI_SCOPES_OPTIONAL = ['gn.balance.read'];

const DAY_S = 86400;

/** O .p12 abre (senha vazia, como a Efí entrega)? Erro em português se não. */
export function checkCertificate(p12) {
  const buf = Buffer.isBuffer(p12) ? p12 : Buffer.from(String(p12 || ''), 'base64');
  if (!buf.length) throw Object.assign(new Error('Envie o certificado .p12 da Efí'), { status: 400 });
  if (buf.length > 64 * 1024) throw Object.assign(new Error('Arquivo grande demais para um certificado .p12'), { status: 400 });
  try {
    tls.createSecureContext({ pfx: buf, passphrase: '' });
  } catch {
    throw Object.assign(new Error('Esse arquivo não abriu como certificado .p12 da Efí (senha vazia). Baixe de novo em API → Meus Certificados'), { status: 400 });
  }
  return buf;
}

/**
 * txid da mensalidade: [a-zA-Z0-9]{26,35} (regra do Pix do Banco Central). "pulse" + aaaamm + 21 caracteres do hash do
 * contrato, mês e valor: a mesma mensalidade com o mesmo valor dá sempre o mesmo txid; valor novo, txid novo.
 */
export function txidFor({ contractId, month, amount }) {
  const hash = crypto.createHash('sha256').update(`${contractId}|${month}|${Math.round(Number(amount || 0) * 100)}`).digest('hex');
  return `pulse${String(month).replace('-', '')}${hash.slice(0, 21)}`;
}

export const isTxid = (v) => /^[a-zA-Z0-9]{26,35}$/.test(String(v || ''));

/** Segundos até o fim do vencimento + validadeDias (mínimo 1 dia), para calendario.expiracao da cob. */
export function expiracaoFor(dueDate, { validadeDias = 30, now = new Date() } = {}) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) ? Date.parse(`${dueDate}T23:59:59-03:00`) : now.getTime();
  const end = Math.max(base, now.getTime()) + validadeDias * DAY_S * 1000;
  return Math.max(DAY_S, Math.round((end - now.getTime()) / 1000));
}

const money = (v) => (Math.round(Number(v || 0) * 100) / 100).toFixed(2);
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/** Corpo do PUT /v2/cob/:txid da mensalidade. */
export function cobBody({ chave, amount, dueDate, solicitacao, info = [], now }) {
  if (!String(chave || '').trim()) throw new Error('Falta a chave Pix da conta Efí');
  if (!(Number(amount) > 0)) throw new Error('Valor da cobrança inválido');
  return {
    calendario: { expiracao: expiracaoFor(dueDate, { now }) },
    valor: { original: money(amount) },
    chave: String(chave).trim(),
    solicitacaoPagador: clip(solicitacao || 'Mensalidade Agência Pulse', 140),
    ...(info.length ? { infoAdicionais: info.slice(0, 5).map((i) => ({ nome: clip(i.nome, 50), valor: clip(i.valor, 200) })) } : {}),
  };
}

/** Cobrança paga: status CONCLUIDA e a soma dos Pix (sem devolução) cobre o valor. */
export function cobPaid(cob) {
  if (!cob || cob.status !== 'CONCLUIDA') return { paid: false };
  const pix = Array.isArray(cob.pix) ? cob.pix : [];
  const got = pix.reduce((s, p) => s + Number(p.valor || 0), 0);
  const original = Number(cob.valor?.original || 0);
  return {
    paid: pix.length ? got + 0.001 >= original : true,
    amount: pix.length ? Math.round(got * 100) / 100 : original,
    e2e: pix[0]?.endToEndId || null,
    at: pix[0]?.horario || null,
  };
}

/** Os Pix de uma notificação do webhook (só o que importa; o resto fica em raw). */
export function readEfiWebhook(body) {
  const list = Array.isArray(body?.pix) ? body.pix : [];
  return list.filter((p) => p && p.endToEndId).map((p) => ({
    e2e: String(p.endToEndId),
    txid: p.txid ? String(p.txid) : null,
    valor: Number(p.valor || 0),
    horario: p.horario || null,
    info: p.infoPagador || null,
  }));
}

/** Nome de quem pagou, quando a Efí manda (pagador.nome ou gnExtras.pagador.nome). */
export const payerName = (p) => clip(p?.pagador?.nome || p?.gnExtras?.pagador?.nome || '', 80) || null;

/** hmac da URL do webhook (a doc da Efí recomenda, junto com o mTLS): o servidor recusa notificação sem ele. */
export const newWebhookSecret = () => crypto.randomBytes(18).toString('hex');
export function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** URL cadastrada na Efí: hmac por cidade e "&ignorar=" para a Efí não acrescentar "/pix" (aceitamos os dois). */
export function webhookUrlFor(publicBase, city, secret) {
  return `${String(publicBase || 'https://agenciapulse.tech').replace(/\/+$/, '')}/api/webhooks/efi/${city}?hmac=${secret}&ignorar=`;
}

export class EfiError extends Error {
  constructor(status, body) {
    const msg = body?.mensagem || body?.error_description || body?.message || body?.nome || body?.raw || 'erro';
    super(`Efí ${status}: ${String(msg).slice(0, 240)}`);
    this.status = status;
    this.body = body;
  }
}

/** Requisição HTTPS com o certificado (mTLS). Trocável nos testes (request). */
export function mtlsRequest(p12) {
  const agent = new https.Agent({ pfx: checkCertificate(p12), passphrase: '', keepAlive: true });
  return ({ method, url, headers, body }) => new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, agent, timeout: 20000 }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, text }));
    });
    req.on('timeout', () => req.destroy(new Error('A Efí não respondeu em 20 s')));
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Cliente da API Pix da Efí. request({ method, url, headers, body }) → { status, text }: o padrão usa o .p12 (mTLS);
 * nos testes vem um falso. O token é guardado até 1 min antes de vencer; 401 renova uma vez.
 */
export function createEfiClient({ clientId, clientSecret, env = 'producao', p12 = null, request = null, now = () => Date.now() }) {
  const base = EFI_PIX_BASE[env];
  if (!base) throw new Error('Ambiente da Efí inválido (producao ou homologacao)');
  if (!clientId || !clientSecret) throw new Error('Faltam o Client ID e o Client Secret da Efí');
  const send = request || mtlsRequest(p12);
  let token = null;
  let expiresAt = 0;
  let scopes = [];

  const parse = (text) => { try { return text ? JSON.parse(text) : {}; } catch { return { raw: String(text).slice(0, 300) }; } };

  async function auth(force = false) {
    if (!force && token && now() < expiresAt) return { token, scopes };
    const r = await send({
      method: 'POST',
      url: `${base}/oauth/token`,
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    const data = parse(r.text);
    if (r.status >= 400 || !data.access_token) throw new EfiError(r.status || 500, data);
    token = data.access_token;
    expiresAt = now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000;
    scopes = String(data.scope || '').split(/\s+/).filter(Boolean);
    return { token, scopes };
  }

  async function call(method, path, body, retried = false) {
    await auth();
    const r = await send({
      method,
      url: `${base}${path}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (r.status === 401 && !retried) { token = null; return call(method, path, body, true); }
    const data = parse(r.text);
    if (r.status >= 400) throw new EfiError(r.status, data);
    return data;
  }

  const enc = encodeURIComponent;
  return {
    env,
    auth,
    scopes: () => scopes,
    putCob: (txid, body) => call('PUT', `/v2/cob/${enc(txid)}`, body),
    getCob: (txid) => call('GET', `/v2/cob/${enc(txid)}`),
    qrcode: (locId) => call('GET', `/v2/loc/${enc(locId)}/qrcode`),
    listCob: (inicio, fim) => call('GET', `/v2/cob?inicio=${enc(inicio)}&fim=${enc(fim)}`),
    /** Pix recebidos no período, todas as páginas (até 20). */
    async listPix(inicio, fim) {
      const all = [];
      for (let page = 0; page < 20; page += 1) {
        const data = await call('GET', `/v2/pix?inicio=${enc(inicio)}&fim=${enc(fim)}&paginacao.paginaAtual=${page}`);
        all.push(...(Array.isArray(data.pix) ? data.pix : []));
        const pages = Number(data.parametros?.paginacao?.quantidadeDePaginas || 1);
        if (page + 1 >= pages) break;
      }
      return all;
    },
    /** Um Pix recebido pelo ID da transação (E2E); 404 = não caiu nesta conta. */
    getPix: (e2e) => call('GET', `/v2/pix/${enc(e2e)}`),
    saldo: () => call('GET', '/v2/gn/saldo/'),
    putWebhook: (chave, webhookUrl) => call('PUT', `/v2/webhook/${enc(chave)}`, { webhookUrl }),
    getWebhook: (chave) => call('GET', `/v2/webhook/${enc(chave)}`),
  };
}

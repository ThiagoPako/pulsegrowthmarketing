// Assistente PULSE — utilidades comuns (cidades, telefones, datas, dinheiro, envio pelo número do PULSE, log).

import { enqueueWhatsApp } from '../whatsapp/shared.mjs';

export const TZ = 'America/Sao_Paulo';

/** O que cada número autorizado pode fazer (marcado por número na tela). Checado no servidor, por ferramenta. */
export const PERMISSIONS = {
  consultar_financeiro: 'Consultar financeiro (resumo do mês, receitas, despesas, saldo, a receber)',
  lancar_financeiro: 'Lançar despesa ou receita',
  inadimplentes: 'Ver inadimplentes',
  relatorios: 'Pedir o relatório mensal de um cliente',
  enviar_cliente: 'Mandar mensagem ou arquivo ao cliente',
  criar_cards: 'Criar card de conteúdo/vídeo ou de design',
  alertas_grupos: 'Receber os avisos de demanda detectada nos grupos',
  alertas_satisfacao: 'Receber os avisos de cliente insatisfeito (temperatura do cliente)',
  lembretes_stories: 'Receber os lembretes de story para postar com link (Agendamentos)',
  consultar_producao: 'Ver andamento de cards e agenda',
  editar_cards: 'Mudar cards (mover, pedir alteração, prazo, prioridade, responsável, dados do card)',
  agenda: 'Marcar, remarcar e cancelar gravações',
  cadastro_clientes: 'Ver e atualizar o cadastro dos clientes (e pré-cadastrar cliente novo)',
  comandar_agentes: 'Dar ordens aos agentes de IA (Marcely, Uriel, editores, designers), pausar e retomar',
};

export const CITIES = { minacu: 'Minaçu', uruacu: 'Uruaçu' };

export const CONFIRM_MINUTES = 30;

export const norm = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim();

export function normalizeCity(value) {
  const n = norm(value);
  if (n.includes('minac')) return 'minacu';
  if (n.includes('uruac')) return 'uruacu';
  return null;
}

/** Mesma regra do servidor (cityScopeExpression): cidade vazia vale Minaçu. */
export const cityExpr = (column) => `replace(lower(coalesce(nullif(btrim(${column}::text), ''), 'minacu')), 'ç', 'c')`;

/** Cidade do cliente; null = cliente administrativo da agência (vale nas duas cidades). */
export function clientCity(client) {
  if (!client) return null;
  if (client.is_admin_client) return null;
  return normalizeCity(client.city) || 'minacu';
}

export function clientAllowed(number, client) {
  const city = clientCity(client);
  if (!city) return (number.cities || []).length > 0;
  return (number.cities || []).includes(city);
}

export const cityLabel = (city) => CITIES[city] || (city ? String(city) : 'Minaçu e Uruaçu');

export const digits = (value) => String(value || '').replace(/\D/g, '');

/** Telefone guardado sempre com DDI 55 (quem digita sem DDI ganha o 55). */
export function canonicalPhone(value) {
  const d = digits(value);
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/** Com e sem o 55 e com e sem o 9º dígito (o WhatsApp devolve qualquer um deles). */
export function phoneVariants(phone) {
  const d = digits(phone);
  const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  const set = new Set([local]);
  if (local.length === 11 && local[2] === '9') set.add(local.slice(0, 2) + local.slice(3));
  if (local.length === 10) set.add(`${local.slice(0, 2)}9${local.slice(2)}`);
  return [...set].filter(Boolean).flatMap((v) => [v, `55${v}`]);
}

function brazilParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).map((p) => [p.type, p.value])
  );
}

export function brazilToday(date = new Date()) {
  const p = brazilParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export const brazilMonth = (date = new Date()) => brazilToday(date).slice(0, 7);

export function brazilNowLabel(date = new Date()) {
  const p = brazilParts(date);
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(date);
  return `${p.day}/${p.month}/${p.year} (${weekday}), ${p.hour}:${p.minute}`;
}

export const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
export const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthLabel = (month) => {
  const [y, m] = String(month || '').split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]}/${y}` : String(month || '');
};

export const fmtDate = (value) => {
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s;
};

// "R$ 350,00" com espaço comum (o Intl põe espaço não separável)
export const fmtMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

/** Texto curto para caber no WhatsApp e no banco (sem caracteres de controle). */
export const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

/** Escapa curingas do ILIKE (o texto da pessoa não vira padrão). */
export const likeEscape = (value) => String(value || '').replace(/[\\%_]/g, (c) => `\\${c}`);

// ── Banco ──
export async function getSettings(pool) {
  const { rows } = await pool.query('SELECT * FROM assistant_settings WHERE id = 1');
  return rows[0] || { enabled: false, group_monitor_enabled: false };
}

/** Conexão com a função "assistente" (a conectada primeiro). */
export async function assistantConnection(pool) {
  const { rows } = await pool.query(
    `SELECT id, name, status, phone, purposes FROM wa_connections WHERE 'assistente' = ANY(purposes)
      ORDER BY (status = 'conectada') DESC, created_at LIMIT 1`
  );
  return rows[0] || null;
}

/**
 * Telefones da equipe (números autorizados do PULSE, parceiros e as conexões da agência), com e sem 55/9º dígito.
 * Mensagem de grupo vinda deles não é fala de cliente (monitor de grupos e temperatura do cliente).
 */
export async function teamPhoneSet(pool) {
  const { rows } = await pool.query(
    `SELECT phone FROM assistant_numbers
      UNION ALL SELECT phone FROM partners WHERE phone IS NOT NULL AND phone <> ''
      UNION ALL SELECT phone FROM wa_connections WHERE phone IS NOT NULL`
  ).catch(() => ({ rows: [] }));
  return new Set(rows.flatMap((r) => phoneVariants(r.phone)));
}

export async function findNumberByPhone(pool, phone) {
  if (!digits(phone)) return null;
  const { rows } = await pool.query(
    `SELECT n.*, p.name AS user_name FROM assistant_numbers n LEFT JOIN profiles p ON p.id = n.user_id
      WHERE n.phone = ANY($1) ORDER BY n.active DESC LIMIT 1`,
    [phoneVariants(phone)]
  );
  return rows[0] || null;
}

export async function getNumber(pool, id) {
  const { rows } = await pool.query(
    `SELECT n.*, p.name AS user_name FROM assistant_numbers n LEFT JOIN profiles p ON p.id = n.user_id WHERE n.id = $1`, [id]
  );
  return rows[0] || null;
}

export async function logEvent(pool, { numberId = null, phone = null, kind, tool = null, text = null, detail = null }) {
  await pool.query(
    `INSERT INTO assistant_log (number_id, phone, kind, tool, text, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
    [numberId, phone, kind, tool, text ? clip(text, 2000) : null, detail === null ? null : JSON.stringify(detail).slice(0, 20000)]
  ).catch((error) => console.error('[assistente] log:', error.message));
}

/**
 * Mensagem do PULSE para um número da equipe, pela conexão do assistente (a mesma que recebeu, quando houver).
 * Sem conexão com a função "assistente", a fila usa a "geral" (regra da fila).
 */
export async function sendToNumber(pool, number, body, { connectionId, mediaUrl, mediaName } = {}) {
  const connId = connectionId || (await assistantConnection(pool))?.id || null;
  return enqueueWhatsApp(pool, {
    to: number.phone, body: clip(body, 4000), purpose: 'assistente', triggerType: 'assistente',
    connectionId: connId, mediaUrl, mediaName, history: false, // conversa interna: fora do histórico geral
  });
}

export async function remember(pool, numberId, role, content) {
  if (!content) return;
  await pool.query(`INSERT INTO assistant_conversations (number_id, role, content) VALUES ($1, $2, $3)`,
    [numberId, role, clip(content, 6000)]).catch((error) => console.error('[assistente] conversa:', error.message));
}

/** Nome de quem pede, como aparece no sistema (usuário da equipe ou o nome cadastrado no número). */
export const requesterName = (number) => clip(number.user_name || number.name || 'Equipe', 80);

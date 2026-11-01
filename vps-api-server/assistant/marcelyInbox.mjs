// Assistente PULSE — caixa da Marcely no WhatsApp (plano aprovado pelo usuário em 01/11/2026: "PULSE como porta e
// Marcely como cérebro").
//
// O PULSE continua sendo o número 24 h. O que pede a Marcely (a chefe dos agentes, uma sessão do Claude Code no PC)
// vira um item na tabela marcely_inbox, que só a chefe lê pelas rotas /api/agent/inbox (agentWhatsAppRoutes.mjs):
//   origem "equipe": mensagem de quem tem a permissão "marcely" que não é comando simples (demanda, pergunta sobre a
//     operação, "cria card…" que precisa de agente) ou que começa chamando a Marcely ("Marcely, …"). O PULSE
//     responde na hora "Recebi, a Marcely já vai ver" e a resposta dela sai pelo número do PULSE (sendToNumber);
//   origem "grupo": o monitor de grupos (monitor.mjs) marca só pedido, reclamação, aprovação ou recusa de cliente, com
//     cliente, grupo, trecho e link do grupo. Texto de grupo é informação, nunca ordem: a Marcely não responde ao
//     cliente por aqui (mensagem a cliente só com o ok do Thiago, pelo `pulse whatsapp enviar`);
//   origem "cliente": cliente conhecido (telefone do cadastro ou de quem fala no grupo dele) que escreveu no privado do
//     PULSE (engine.mjs). O PULSE não responde nem executa nada: só quem está em assistant_numbers dá comando.
// A tabela não tem a coluna "city" (gatilho global de cidade, ver schema.mjs): a cidade vai em "cidade".

import crypto from 'node:crypto';
import { clientsForGroup } from '../whatsapp/shared.mjs';
import { cityLabel, clip, norm, phoneVariants } from './common.mjs';

export const MARCELY_RECEIVED = '📨 Recebi, a Marcely já vai ver.';

/** Tipos de item (o que a Marcely vê na caixa). */
export const INBOX_KINDS = {
  pedido: 'Pedido',
  pergunta: 'Pergunta',
  resposta: 'Resposta a um aviso da Marcely',
  aprovacao: 'Aprovação do cliente',
  recusa: 'Recusa do cliente',
  reclamacao: 'Reclamação do cliente',
  privado: 'Cliente no privado do PULSE',
};

export async function ensureInboxSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marcely_inbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      origem TEXT NOT NULL,
      kind TEXT NOT NULL,
      number_id UUID,
      from_name TEXT,
      client_id UUID,
      cliente TEXT,
      cidade TEXT,
      group_jid TEXT,
      grupo TEXT,
      link TEXT,
      texto TEXT NOT NULL,
      resumo TEXT,
      inbound_id UUID,
      source_key TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'nova',
      read_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      reply TEXT,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marcely_inbox_status ON marcely_inbox (status, created_at)`);
}

/** "Marcely, …", "@Marcely …", "Marceli: …" no começo: vai direto para ela, sem passar pelo modelo. */
export function callsMarcely(text) {
  const n = norm(text).replace(/^[@*_~\s]+/, '');
  return /^marcel[yi]e?\b/.test(n) && n.replace(/^marcel[yi]e?\b[\s,:;.!-]*/, '').length > 0;
}

/** Grava um item (source_key repetida = já gravado: devolve null). */
export async function addInboxItem(pool, item) {
  const kind = INBOX_KINDS[item.kind] ? item.kind : 'pedido';
  const { rows: [row] } = await pool.query(
    `INSERT INTO marcely_inbox (origem, kind, number_id, from_name, client_id, cliente, cidade, group_jid, grupo, link, texto, resumo, inbound_id, source_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (source_key) DO NOTHING RETURNING *`,
    [['grupo', 'cliente'].includes(item.origem) ? item.origem : 'equipe', kind, item.numberId || null, clip(item.fromName, 80) || null,
      item.clientId || null, clip(item.cliente, 120) || null, item.cidade || null, item.groupJid || null,
      clip(item.grupo, 120) || null, clip(item.link, 300) || null, clip(item.texto, 4000) || '(sem texto)',
      clip(item.resumo, 1200) || null, item.inboundId || null, item.sourceKey || crypto.randomUUID()]
  );
  return row || null;
}

/**
 * Cliente dono deste telefone: o WhatsApp do cadastro do cliente ou alguém que já falou no grupo dele (o PULSE fica
 * nos grupos dos clientes desde 01/11/2026). Só clientes ativos; mais de um (pessoa em dois grupos) → o primeiro
 * por nome, com os outros em "outros". Telefone da equipe nunca passa por aqui (só quem não está em assistant_numbers).
 */
export async function clientByPhone(pool, phone) {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const { rows: own } = await pool.query(
    `SELECT id FROM clients WHERE status IS DISTINCT FROM 'cancelado'
        AND regexp_replace(coalesce(whatsapp, ''), '[^0-9]', '', 'g') = ANY($1) ORDER BY company_name`, [variants]
  );
  // grupos em que este telefone já falou (o vínculo grupo → cliente é o mesmo do monitor: clientsForGroup)
  const { rows: groups } = await pool.query(
    `SELECT DISTINCT group_jid FROM wa_inbound WHERE group_jid IS NOT NULL AND phone = ANY($1) AND received_at > now() - interval '180 days'`,
    [variants]
  );
  const ids = own.map((r) => r.id);
  for (const { group_jid: jid } of groups) {
    for (const c of await clientsForGroup(pool, jid)) if (!ids.includes(c.id)) ids.push(c.id);
  }
  if (!ids.length) return null;
  const { rows } = await pool.query(
    `SELECT id, company_name, city, is_admin_client, whatsapp_group FROM clients WHERE id = ANY($1) AND status IS DISTINCT FROM 'cancelado'`, [ids]
  );
  const sorted = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean); // primeiro o do cadastro
  if (!sorted.length) return null;
  return { ...sorted[0], via: own.some((r) => r.id === sorted[0].id) ? 'cadastro' : 'grupo', outros: sorted.slice(1).map((c) => c.company_name) };
}

/** Nome do grupo (assunto guardado pelo pulse-wa) e link de convite do cliente, quando houver. */
export async function groupInfo(pool, groupJid, client) {
  const { rows: [g] } = await pool.query(
    `SELECT subject FROM wa_groups WHERE jid = $1 AND subject IS NOT NULL ORDER BY updated_at DESC LIMIT 1`, [groupJid]
  ).catch(() => ({ rows: [] }));
  const raw = String(client?.whatsapp_group || '').trim();
  return { grupo: g?.subject || null, link: /^https?:\/\//i.test(raw) ? raw : null };
}

/** Formato da caixa para a chefe (o que o `pulse whatsapp caixa` mostra). */
export const inboxView = (r) => ({
  id: r.id, origem: r.origem, tipo: r.kind, tipo_label: INBOX_KINDS[r.kind] || r.kind, status: r.status,
  de: r.from_name, cliente: r.cliente, cidade: r.cidade ? cityLabel(r.cidade) : null, grupo: r.grupo, link: r.link,
  texto: r.texto, resumo: r.resumo, resposta: r.reply, nota: r.note,
  criado_em: r.created_at, lido_em: r.read_at, respondido_em: r.replied_at,
});

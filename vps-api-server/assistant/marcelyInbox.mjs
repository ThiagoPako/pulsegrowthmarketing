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
//     cliente por aqui (mensagem a cliente só com o ok do Thiago, pelo `pulse whatsapp enviar`).
// A tabela não tem a coluna "city" (gatilho global de cidade, ver schema.mjs): a cidade vai em "cidade".

import crypto from 'node:crypto';
import { cityLabel, clip, norm } from './common.mjs';

export const MARCELY_RECEIVED = '📨 Recebi, a Marcely já vai ver.';

/** Tipos de item (o que a Marcely vê na caixa). */
export const INBOX_KINDS = {
  pedido: 'Pedido',
  pergunta: 'Pergunta',
  resposta: 'Resposta a um aviso da Marcely',
  aprovacao: 'Aprovação do cliente',
  recusa: 'Recusa do cliente',
  reclamacao: 'Reclamação do cliente',
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
    [item.origem === 'grupo' ? 'grupo' : 'equipe', kind, item.numberId || null, clip(item.fromName, 80) || null,
      item.clientId || null, clip(item.cliente, 120) || null, item.cidade || null, item.groupJid || null,
      clip(item.grupo, 120) || null, clip(item.link, 300) || null, clip(item.texto, 4000) || '(sem texto)',
      clip(item.resumo, 1200) || null, item.inboundId || null, item.sourceKey || crypto.randomUUID()]
  );
  return row || null;
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

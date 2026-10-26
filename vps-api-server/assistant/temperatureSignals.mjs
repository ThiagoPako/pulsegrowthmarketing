// Temperatura do cliente — sinais de dados (tabelas reais do sistema), últimos 30 dias contra os 30 anteriores.
//
//   atrasos      content_tasks com editing_deadline estourado (enviado depois do prazo ou ainda em produção) e
//                design_tasks com due_date (dia) estourado (enviada/aprovada depois do dia ou ainda em produção)
//   ajustes      pedidos de ajuste do cliente: comentários "🔧 Ajuste solicitado" do cliente no portal (vale também
//                para o pedido feito pelo WhatsApp), histórico das artes "Ajuste solicitado pelo cliente" (sem contar
//                de novo o que já veio pelo comentário) e demandas de ajuste detectadas no grupo pelo PULSE
//   devolvidos   itens com 2+ pedidos de ajuste do cliente no período
//   aprovacao    mediana de horas entre o envio e a aprovação (vídeos e artes; aprovação automática não conta) e
//                itens esperando aprovação há mais de 7 dias
//   gravacoes    gravações canceladas pelo cliente no WhatsApp (whatsapp_confirmations) e canceladas/remarcadas
//                no portal (o aviso "pelo cliente" gravado em notifications, um por evento)
//   entregas     vídeos e artes enviados no mês contra o contratado (reels + criativos por semana × 4 e as artes do
//                plano), proporcional ao dia do mês; nos primeiros 9 dias vale o mês anterior inteiro
//   inadimplencia receitas vencidas e não pagas (mesmas regras do financeiro: finance.mjs)
//   portal       dias com acesso ao portal (client_portal_access_days) e vídeos do portal vistos (portal_video_views)
//   respostaEquipe mediana do tempo entre a mensagem do cliente no grupo e a primeira resposta visível da equipe
//                (número da equipe no grupo ou mensagem mandada pelo sistema)
//   silencio     dias desde a última mensagem do cliente no grupo (só quando o grupo é acompanhado há 21+ dias)
// Cada sinal é calculado à parte: se uma consulta falhar (coluna antiga, tabela ausente), o sinal fica null e não pesa.

import { DELINQUENCY_START, dedupeRevenues, isOverdue } from './finance.mjs';
import { brazilToday, digits, likeEscape, monthRange, brazilMonth } from './common.mjs';

const DAY = 86_400_000;
const IN_PRODUCTION_CONTENT = ['captacao', 'edicao', 'pre_revisao', 'revisao', 'alteracao'];
const IN_PRODUCTION_DESIGN = ['nova_tarefa', 'executando', 'fila_baixa_prioridade', 'ajustes', 'analise_ia', 'em_analise'];
const ADJUST_COMMENT = '🔧 Ajuste solicitado%';
const ADJUST_DESIGN = '🔧 Ajuste solicitado pelo cliente via Pulse Club';

const num = (v) => (v === null || v === undefined ? null : Number(v));
const roundTo = (v, d = 1) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/** Grupo do cliente: o jid cadastrado ou o do link de convite já resolvido (wa_jid_cache, como no clientsForGroup). */
export async function groupJidFor(pool, client) {
  const group = String(client?.whatsapp_group || '').trim();
  if (!group) return null;
  if (/@g\.us$/.test(group)) return group;
  const code = group.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i)?.[1];
  if (!code) return null;
  const { rows } = await pool.query(`SELECT jid FROM wa_jid_cache WHERE number = $1 AND jid IS NOT NULL LIMIT 1`, [`grupo:${code}`])
    .catch(() => ({ rows: [] }));
  return rows[0]?.jid || null;
}

export function createSignals(pool) {
  const safe = async (name, fn) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`[temperatura] sinal ${name}:`, error.message);
      return null;
    }
  };

  async function atrasos(id, w) {
    const { rows: [r] } = await pool.query(
      `WITH itens AS (
         SELECT editing_deadline AS prazo FROM content_tasks
          WHERE client_id = $1 AND editing_deadline >= $2 AND editing_deadline < $4
            AND ((approval_sent_at IS NOT NULL AND approval_sent_at > editing_deadline)
              OR (approval_sent_at IS NULL AND approved_at IS NULL AND kanban_column = ANY($5)))
         UNION ALL
         SELECT prazo FROM (
           SELECT (((due_date AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS prazo,
                  COALESCE(sent_to_client_at, client_approved_at, completed_at) AS feito, kanban_column
             FROM design_tasks WHERE client_id = $1 AND due_date IS NOT NULL) d
          WHERE prazo >= $2 AND prazo < $4 AND (feito > prazo OR (feito IS NULL AND kanban_column = ANY($6)))
       )
       SELECT count(*) FILTER (WHERE prazo >= $3)::int AS atual, count(*) FILTER (WHERE prazo < $3)::int AS anterior FROM itens`,
      [id, w.prevStart, w.curStart, w.now, IN_PRODUCTION_CONTENT, IN_PRODUCTION_DESIGN]
    );
    return { atual: r.atual, anterior: r.anterior };
  }

  async function enviadas(id, w) {
    const { rows: [r] } = await pool.query(
      `SELECT count(*) FILTER (WHERE quando >= $3)::int AS atual, count(*) FILTER (WHERE quando < $3)::int AS anterior FROM (
         SELECT approval_sent_at AS quando FROM content_tasks WHERE client_id = $1 AND approval_sent_at >= $2 AND approval_sent_at < $4
         UNION ALL
         SELECT COALESCE(sent_to_client_at, client_approved_at) FROM design_tasks
          WHERE client_id = $1 AND COALESCE(sent_to_client_at, client_approved_at) >= $2 AND COALESCE(sent_to_client_at, client_approved_at) < $4
       ) x`,
      [id, w.prevStart, w.curStart, w.now]
    );
    return r;
  }

  async function ajustes(id, w) {
    const { rows } = await pool.query(
      `SELECT item, quando FROM (
         SELECT 'c:' || cm.content_id::text AS item, cm.created_at AS quando
           FROM client_portal_comments cm JOIN client_portal_contents pc ON pc.id = cm.content_id
          WHERE pc.client_id = $1 AND cm.author_type = 'client' AND cm.message LIKE $4 AND cm.created_at >= $2 AND cm.created_at < $3
         UNION ALL
         SELECT 'd:' || h.task_id::text, h.created_at
           FROM design_task_history h JOIN design_tasks d ON d.id = h.task_id
          WHERE d.client_id = $1 AND h.action = $5 AND h.created_at >= $2 AND h.created_at < $3
            AND NOT EXISTS (
              SELECT 1 FROM client_portal_contents pc2 JOIN client_portal_comments cm2 ON cm2.content_id = pc2.id
               WHERE pc2.design_task_id = h.task_id AND cm2.author_type = 'client' AND cm2.message LIKE $4
                 AND abs(extract(epoch FROM cm2.created_at - h.created_at)) < 300)
         UNION ALL
         SELECT 'g:' || id::text, created_at FROM assistant_demands
          WHERE client_id = $1 AND kind = 'ajuste' AND created_at >= $2 AND created_at < $3
       ) x`,
      [id, w.prevStart, w.now, ADJUST_COMMENT, ADJUST_DESIGN]
    );
    const cur = rows.filter((r) => new Date(r.quando) >= w.curStart);
    const prev = rows.filter((r) => new Date(r.quando) < w.curStart);
    const repeated = (list) => {
      const count = new Map();
      for (const r of list) count.set(r.item, (count.get(r.item) || 0) + 1);
      return [...count.values()].filter((n) => n >= 2).length;
    };
    return { atual: cur.length, anterior: prev.length, devolvidos: repeated(cur), devolvidosAnterior: repeated(prev) };
  }

  async function aprovacao(id, w) {
    const { rows: [r] } = await pool.query(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY horas) FILTER (WHERE quando >= $3) AS atual,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY horas) FILTER (WHERE quando < $3) AS anterior,
              count(*) FILTER (WHERE quando >= $3)::int AS aprovados
         FROM (
           SELECT extract(epoch FROM approved_at - approval_sent_at) / 3600 AS horas, approved_at AS quando FROM content_tasks
            WHERE client_id = $1 AND approved_at >= $2 AND approved_at < $4 AND approval_sent_at IS NOT NULL AND approved_at > approval_sent_at
           UNION ALL
           SELECT extract(epoch FROM client_approved_at - sent_to_client_at) / 3600, client_approved_at FROM design_tasks
            WHERE client_id = $1 AND client_approved_at >= $2 AND client_approved_at < $4 AND sent_to_client_at IS NOT NULL
              AND client_approved_at > sent_to_client_at AND auto_approved IS NOT TRUE
         ) x`,
      [id, w.prevStart, w.curStart, w.now]
    );
    const { rows: [waiting] } = await pool.query(
      `SELECT (SELECT count(*) FROM content_tasks WHERE client_id = $1 AND kanban_column = 'envio' AND approved_at IS NULL
                 AND approval_sent_at < $2)::int
            + (SELECT count(*) FROM design_tasks WHERE client_id = $1 AND kanban_column = 'enviar_cliente'
                 AND sent_to_client_at < $2)::int AS esperando`,
      [id, new Date(w.now - 7 * DAY)]
    );
    return { horas: roundTo(num(r.atual)), anterior: roundTo(num(r.anterior)), aprovados: r.aprovados, esperando: waiting.esperando };
  }

  async function gravacoes(id, client, w) {
    const { rows } = await pool.query(
      `SELECT quando, tipo FROM (
         SELECT responded_at AS quando, 'cancelou' AS tipo FROM whatsapp_confirmations
          WHERE client_id = $1 AND status = 'cancelled' AND responded_at >= $2 AND responded_at < $3
         UNION ALL
         SELECT DISTINCT ON (n.message, date_trunc('minute', n.created_at)) n.created_at,
                CASE WHEN n.title = 'Reagendamento pelo cliente' THEN 'remarcou' ELSE 'cancelou' END
           FROM notifications n
          WHERE n.title IN ('Gravação cancelada pelo cliente', 'Reagendamento pelo cliente') AND n.created_at >= $2 AND n.created_at < $3
            AND (n.message LIKE $4 || ' cancelou gravação%' OR n.message LIKE $4 || ' reagendou gravação%')
       ) x`,
      [id, w.prevStart, w.now, likeEscape(client.company_name || '')]
    );
    const cur = rows.filter((r) => new Date(r.quando) >= w.curStart);
    return {
      atual: cur.length,
      anterior: rows.length - cur.length,
      canceladas: cur.filter((r) => r.tipo === 'cancelou').length,
      remarcadas: cur.filter((r) => r.tipo === 'remarcou').length,
    };
  }

  async function entregas(id, client, w) {
    const weekly = Number(client.weekly_reels || 0) + Number(client.weekly_creatives || 0);
    let arts = 0;
    if (client.plan_id) {
      const { rows } = await pool.query('SELECT arts_qty FROM plans WHERE id = $1', [client.plan_id]).catch(() => ({ rows: [] }));
      arts = Number(rows[0]?.arts_qty || 0);
    }
    const contratado = Math.round(weekly * 4) + arts;
    if (contratado <= 0) return null;
    const month = brazilMonth(w.now);
    const { start, end } = monthRange(month);
    const prevMonth = brazilMonth(new Date(new Date(`${start}T12:00:00Z`).getTime() - 2 * DAY));
    const prevRange = monthRange(prevMonth);
    const ts = (day) => `${day}T00:00:00-03:00`;
    const count = async (from, to) => {
      const { rows: [r] } = await pool.query(
        `SELECT (SELECT count(*) FROM content_tasks WHERE client_id = $1 AND content_type NOT ILIKE 'stor%'
                   AND COALESCE(approval_sent_at, approved_at) >= $2 AND COALESCE(approval_sent_at, approved_at) < $3)::int
              + (SELECT count(*) FROM design_tasks WHERE client_id = $1
                   AND COALESCE(sent_to_client_at, client_approved_at) >= $2 AND COALESCE(sent_to_client_at, client_approved_at) < $3)::int AS feitas`,
        [id, from, to]
      );
      return r.feitas;
    };
    const today = brazilToday(w.now);
    const day = Number(today.slice(8, 10));
    const daysInMonth = Number(end.slice(8, 10));
    const feitasMes = await count(ts(start), w.now);
    const feitasAnterior = await count(ts(prevRange.start), ts(start));
    if (day >= 10) {
      return {
        referencia: 'mes', avaliar: true, contratado, previsto: Math.round(contratado * Math.min(1, day / daysInMonth) * 10) / 10,
        feitas: feitasMes, mesAnterior: feitasAnterior,
      };
    }
    return { referencia: 'mes_anterior', avaliar: true, contratado, previsto: contratado, feitas: feitasAnterior, mesAtual: feitasMes };
  }

  async function inadimplencia(id) {
    const { rows } = await pool.query(
      `SELECT id, client_id, reference_month, amount, due_date, status, paid_at, description, recurrence_id, updated_at, created_at
         FROM revenues WHERE client_id = $1 AND reference_month >= $2::date`,
      [id, DELINQUENCY_START]
    );
    const today = brazilToday();
    const overdue = dedupeRevenues(rows).filter((r) => isOverdue(r, today));
    const days = overdue.map((r) => {
      const due = r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date || '').slice(0, 10);
      return due ? Math.max(0, Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${due}T12:00:00Z`)) / DAY)) : 0;
    });
    return {
      parcelas: overdue.length,
      total: Math.round(overdue.reduce((s, r) => s + Number(r.amount || 0), 0) * 100) / 100,
      maxDias: days.length ? Math.max(...days) : 0,
    };
  }

  async function portal(id, w, sent) {
    const { rows: [access] } = await pool.query(
      `SELECT count(*) FILTER (WHERE dia >= $2::date)::int AS atual, count(*) FILTER (WHERE dia < $2::date)::int AS anterior
         FROM client_portal_access_days WHERE client_id = $1 AND dia >= $3::date`,
      [id, brazilToday(w.curStart), brazilToday(w.prevStart)]
    );
    const { rows: [first] } = await pool.query(`SELECT min(dia)::text AS inicio FROM client_portal_access_days`);
    const views = await pool.query(
      `SELECT count(*) FILTER (WHERE viewed_at >= $2)::int AS atual, count(*) FILTER (WHERE viewed_at < $2)::int AS anterior
         FROM portal_video_views WHERE client_id = $1 AND viewed_at >= $3`,
      [id, w.curStart, w.prevStart]
    ).then((r) => r.rows[0]).catch(() => null);
    return {
      diasComAcesso: access.atual,
      diasAnterior: access.anterior,
      videosVistos: views ? views.atual : null,
      videosAnterior: views ? views.anterior : null,
      entregasEnviadas: sent?.atual ?? 0,
      // só pesa com 30 dias de registro de acesso (antes disso, ausência de acesso não quer dizer nada)
      avaliar: !!first?.inicio && first.inicio <= brazilToday(w.curStart),
    };
  }

  async function grupo(client, w, team) {
    const groupJid = await groupJidFor(pool, client);
    if (!groupJid) return { respostaEquipe: null, silencio: null };
    const { rows: messages } = await pool.query(
      `SELECT phone, received_at FROM wa_inbound WHERE group_jid = $1 AND received_at >= $2 AND received_at < $3 ORDER BY received_at`,
      [groupJid, w.curStart, w.now]
    );
    const targets = [groupJid, String(client.whatsapp_group || '').trim()].filter(Boolean);
    const { rows: sent } = await pool.query(
      `SELECT COALESCE(sent_at, created_at) AS received_at FROM wa_outbox
        WHERE to_number = ANY($1) AND status = 'enviada' AND sent_by IS NOT NULL AND created_at >= $2 AND created_at < $3`,
      [targets, w.curStart, w.now]
    ).catch(() => ({ rows: [] }));
    const isTeam = (m) => m.phone && team.has(digits(m.phone));
    const events = [
      ...messages.map((m) => ({ at: new Date(m.received_at).getTime(), team: !!isTeam(m) })),
      ...sent.map((m) => ({ at: new Date(m.received_at).getTime(), team: true })),
    ].sort((a, b) => a.at - b.at);
    // conversa = mensagens do cliente até a primeira resposta da equipe (sem resposta visível, não entra na conta)
    const waits = [];
    let waitingSince = null;
    for (const e of events) {
      if (!e.team && waitingSince === null) waitingSince = e.at;
      else if (e.team && waitingSince !== null) {
        waits.push((e.at - waitingSince) / 3_600_000);
        waitingSince = null;
      }
    }
    const lastClient = [...messages].reverse().find((m) => !isTeam(m));
    const { rows: [old] } = await pool.query(
      `SELECT 1 AS ok FROM wa_inbound WHERE group_jid = $1 AND received_at < $2 LIMIT 1`, [groupJid, new Date(w.now - 21 * DAY)]
    );
    const dias = lastClient ? Math.floor((w.now - new Date(lastClient.received_at)) / DAY) : 30;
    return {
      respostaEquipe: { conversas: waits.length, medianaHoras: roundTo(median(waits)) },
      silencio: { observado: !!old, dias, mensagensCliente: messages.filter((m) => !isTeam(m)).length },
    };
  }

  /** Todos os sinais do cliente. team = telefones da equipe (teamPhoneSet). */
  async function collect(client, { team, now = new Date() } = {}) {
    const w = { now, curStart: new Date(now - 30 * DAY), prevStart: new Date(now - 60 * DAY) };
    const id = client.id;
    const [late, sent, adjust, approval, recordings, delivery, debt, group] = await Promise.all([
      safe('atrasos', () => atrasos(id, w)),
      safe('enviadas', () => enviadas(id, w)),
      safe('ajustes', () => ajustes(id, w)),
      safe('aprovacao', () => aprovacao(id, w)),
      safe('gravacoes', () => gravacoes(id, client, w)),
      safe('entregas', () => entregas(id, client, w)),
      safe('inadimplencia', () => inadimplencia(id)),
      safe('grupo', () => grupo(client, w, team || new Set())),
    ]);
    const portalUse = await safe('portal', () => portal(id, w, sent));
    return {
      atrasos: late,
      ajustes: adjust ? { atual: adjust.atual, anterior: adjust.anterior, entregas: sent?.atual ?? 0, entregasAnterior: sent?.anterior ?? 0 } : null,
      devolvidos: adjust ? { atual: adjust.devolvidos, anterior: adjust.devolvidosAnterior } : null,
      aprovacao: approval,
      gravacoes: recordings,
      entregas: delivery,
      inadimplencia: debt,
      portal: portalUse,
      respostaEquipe: group?.respostaEquipe || null,
      silencio: group?.silencio || null,
    };
  }

  return { collect };
}

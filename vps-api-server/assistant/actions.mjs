// Assistente PULSE — ações que mudam algo no sistema.
//
// Nada aqui roda direto do modelo: a ferramenta monta o payload, o servidor guarda (assistant_pending_actions) e manda
// o resumo pedindo "sim". No "sim", roda o payload guardado — sem chamar o modelo de novo —, conferindo outra vez a
// permissão e a cidade do número (podem ter mudado nos 30 minutos). Cada ação grava como a tela faria:
//   despesa  → expenses (+ espelho no caixa quando paga + financial_activity_log), igual a useFinancialData.addExpense
//   receita  → revenues (+ espelho no caixa quando já recebida + log), igual a FinancialRevenues/addRevenue
//   card     → content_tasks em "ideias" (ContentKanban) ou design_tasks em "nova_tarefa" (DesignTaskCreateDialog)
//   relatório→ agent_jobs (o agente do PC pega pela API /api/agent/jobs)
//   envio    → fila do WhatsApp para o grupo do cliente (clientTarget); cobrança sempre no privado

import { enqueueWhatsApp, clientTarget } from '../whatsapp/shared.mjs';
import {
  CONFIRM_MINUTES, cityLabel, clientAllowed, fmtDate, fmtMoney, monthLabel, clip, requesterName, getNumber, logEvent,
} from './common.mjs';

export const REPORT_THEME = 'novembro-azul-labovitta';
export const REPORT_TEMPLATE_PATH = 'clientes/labo-vitta/design/apresentacoes/2026-10-20-novembro-azul';

export const CONTENT_TYPES = { reels: 'Reels', criativo: 'Criativo', story: 'Story', arte: 'Arte', otimizacao: 'Otimização' };
export const DESIGN_FORMATS = { feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia física', carrossel: 'Carrossel', capa: 'Capa', thumbnail: 'Thumbnail' };
export const DESIGN_PRIORITIES = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
export const REVENUE_CATEGORIES = {
  contrato: '📋 Contrato Mensal', video_unitario: '🎬 Vídeo Unitário', edicao_videos: '🎞️ Edição de Vídeos',
  evento: '🎉 Evento', site_sistemas: '🌐 Site e Sistemas', outros: '📦 Outros',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => UUID.test(String(value || ''));

export async function loadClient(pool, id) {
  if (!isUuid(id)) return null;
  const { rows } = await pool.query(
    `SELECT id, company_name, city, is_admin_client, status, whatsapp, whatsapp_group, responsible_person
       FROM clients WHERE id = $1`, [id]
  );
  return rows[0] || null;
}

const permissionError = (message) => Object.assign(new Error(message), { permission: true });

/** Confere de novo, na hora de executar, o número (ativo), a permissão e a cidade/cliente. */
async function recheck(pool, numberId, permission, { city, clientId } = {}) {
  const number = await getNumber(pool, numberId);
  if (!number || !number.active) throw permissionError('Este número não está mais autorizado.');
  if (permission && !(number.permissions || []).includes(permission)) throw permissionError('Este número não tem mais permissão para isso.');
  let client = null;
  if (clientId) {
    client = await loadClient(pool, clientId);
    if (!client) throw new Error('Cliente não encontrado.');
    if (!clientAllowed(number, client)) throw permissionError('Este número não pode agir na cidade deste cliente.');
  }
  if (city && !(number.cities || []).includes(city)) throw permissionError(`Este número não pode agir em ${cityLabel(city)}.`);
  return { number, client };
}

const isSalaryLike = (description) => /^\s*(sal[áa]rio|b[ôo]nus)\b/i.test(description || '');
const isExpensePaid = (description) => !isSalaryLike(description) || / - PAGO\s*$/i.test(description || '');

async function inTransaction(pool, fn) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

// ── Resumos (o texto que pede o "sim") ──
export const SUMMARIES = {
  lancar_despesa: (p) => `Despesa ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)} · ${p.categoria} · ${fmtDate(p.data)} · '${p.descricao}'${p.tipo === 'variavel' ? ' · variável' : ''}`,
  lancar_receita: (p) => `Receita ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)}${p.cliente ? ` · ${p.cliente}` : ' · sem cliente'} · vence ${fmtDate(p.vencimento)} · ${REVENUE_CATEGORIES[p.categoria] || p.categoria}${p.descricao ? ` · '${p.descricao}'` : ''}${p.recebida ? ' · já recebida' : ' · a receber'}`,
  criar_card_video: (p) => `Card de vídeo (${CONTENT_TYPES[p.tipo] || p.tipo}) · ${p.cliente} (${cityLabel(p.cidade)}) · '${p.titulo}' · Kanban de conteúdo, coluna Ideias${p.descricao ? `\n📝 ${clip(p.descricao, 300)}` : ''}`,
  criar_card_design: (p) => `Card de design (${DESIGN_FORMATS[p.formato] || p.formato}) · ${p.cliente} (${cityLabel(p.cidade)}) · '${p.titulo}' · prioridade ${DESIGN_PRIORITIES[p.prioridade] || p.prioridade}${p.prazo ? ` · prazo ${fmtDate(p.prazo)}` : ''}${p.descricao ? `\n📝 ${clip(p.descricao, 300)}` : ''}`,
  pedir_relatorio: (p) => `Pedir o relatório mensal de ${p.cliente} (${cityLabel(p.cidade)}) · ${monthLabel(p.mes)} · tema Novembro Azul (Labovitta) · gerado pelo agente do PC`,
  enviar_cliente: (p) => `${p.cobranca ? 'Cobrança no privado' : 'Mensagem no grupo'} de ${p.cliente} (${cityLabel(p.cidade)}):\n"${clip(p.mensagem, 600)}"${p.arquivo_url ? `\n📎 ${p.arquivo_nome || p.arquivo_url}` : ''}`,
  enviar_relatorio: (p) => `Enviar o relatório de ${monthLabel(p.mes)} no WhatsApp de ${p.cliente} (${cityLabel(p.cidade)})`,
};

/**
 * Guarda uma ação esperando o "sim" (substitui a que estava esperando, se houver). Devolve a ação.
 * source: comando (pedido pelo WhatsApp), alerta (sugestão do monitor de grupos), entrega (relatório pronto)
 */
export async function proposeAction(pool, number, kind, payload, { source = 'comando' } = {}) {
  const summary = SUMMARIES[kind](payload);
  await pool.query(
    `UPDATE assistant_pending_actions SET status = 'substituida', decided_at = now() WHERE number_id = $1 AND status = 'pendente'`,
    [number.id]
  );
  const { rows } = await pool.query(
    `INSERT INTO assistant_pending_actions (number_id, kind, payload, summary, source, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval) RETURNING *`,
    [number.id, kind, JSON.stringify(payload), summary, source, String(CONFIRM_MINUTES)]
  );
  await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'acao_proposta', tool: kind, text: summary, detail: { action_id: rows[0].id, source } });
  return rows[0];
}

export const confirmQuestion = (summary) => `${summary}\n\nConfirma? (sim/não)`;

// ── Execução do payload guardado ──
const EXECUTORS = {
  async lancar_despesa(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'lancar_financeiro', { city: p.cidade });
    const { rows: [category] } = await pool.query('SELECT id, name FROM expense_categories WHERE id = $1', [p.category_id]);
    if (!category) throw new Error('A categoria não existe mais.');
    return inTransaction(pool, async (db) => {
      const { rows: [expense] } = await db.query(
        `INSERT INTO expenses (date, amount, category_id, expense_type, description, responsible, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [p.data, p.valor, category.id, p.tipo, p.descricao, requesterName(number), p.cidade]
      );
      if (isExpensePaid(p.descricao)) {
        await db.query(
          `INSERT INTO cash_reserve_movements (amount, type, description, date, is_reserve, city) VALUES ($1, 'saida', $2, $3, false, $4)`,
          [p.valor, `[Despesa] ${p.descricao || 'Despesa'} - ID: ${expense.id}`, p.data, p.cidade]
        );
      }
      await db.query(
        `INSERT INTO financial_activity_log (user_id, action_type, entity_type, entity_id, description, details, city)
         VALUES ($1, 'criação', 'despesa', $2, $3, $4, $5)`,
        [number.user_id || null, expense.id,
          `Registrou despesa - R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${p.descricao} (PULSE, ${requesterName(number)})`,
          JSON.stringify({ ...p, origem: 'assistente_pulse', numero: number.name }), p.cidade]
      );
      return { message: `✅ Despesa lançada: ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)} · ${category.name} · ${fmtDate(p.data)}.`, result: { expense_id: expense.id } };
    });
  },

  async lancar_receita(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'lancar_financeiro', p.client_id ? { clientId: p.client_id } : { city: p.cidade });
    const categoryLabel = (REVENUE_CATEGORIES[p.categoria] || '').replace(/^\S+\s/, '');
    const description = [categoryLabel, p.descricao].filter(Boolean).join(' - ') || null;
    const status = p.recebida ? 'recebida' : 'prevista';
    return inTransaction(pool, async (db) => {
      const { rows: [revenue] } = await db.query(
        `INSERT INTO revenues (client_id, reference_month, amount, due_date, status, paid_at, description, category, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, city`,
        [client?.id || null, `${p.vencimento.slice(0, 7)}-01`, p.valor, p.vencimento, status, p.recebida ? p.vencimento : null,
          description, p.categoria, p.cidade]
      );
      if (p.recebida) {
        const label = `${client?.company_name || 'Receita avulsa'} - ${fmtMoney(p.valor)}`;
        await db.query(
          `INSERT INTO cash_reserve_movements (amount, type, description, date, is_reserve, city) VALUES ($1, 'entrada', $2, $3, false, $4)`,
          [p.valor, `[Receita] ${label} - ID: ${revenue.id}`, p.vencimento, revenue.city || p.cidade]
        );
      }
      await db.query(
        `INSERT INTO financial_activity_log (user_id, action_type, entity_type, entity_id, description, details, city)
         VALUES ($1, 'criação', 'receita', $2, $3, $4, $5)`,
        [number.user_id || null, revenue.id,
          `Registrou receita - R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (PULSE, ${requesterName(number)})`,
          JSON.stringify({ ...p, origem: 'assistente_pulse', numero: number.name }), revenue.city || p.cidade]
      );
      return { message: `✅ Receita lançada: ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)}${client ? ` · ${client.company_name}` : ''} · ${p.recebida ? 'recebida' : `vence ${fmtDate(p.vencimento)}`}.`, result: { revenue_id: revenue.id } };
    });
  },

  async criar_card_video(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'criar_cards', { clientId: p.client_id });
    const description = [`🤖 Pedido pelo PULSE (WhatsApp) — ${requesterName(number)}`, p.descricao].filter(Boolean).join('\n\n');
    const { rows: [task] } = await pool.query(
      `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, created_by, position, updated_at)
       VALUES ($1, $2, $3, 'ideias', $4, $5, (SELECT count(*) FROM content_tasks WHERE kanban_column = 'ideias'), now())
       RETURNING id`,
      [client.id, p.titulo, p.tipo, description, number.user_id || null]
    );
    await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [task.id, number.user_id || null, '🤖 Card criado pelo PULSE (WhatsApp)', `Pedido por ${requesterName(number)}`]).catch(() => {});
    await linkDemand(pool, p.demanda_id, 'video', task.id);
    return { message: `✅ Card criado no Kanban de conteúdo (Ideias): '${p.titulo}' — ${client.company_name}.`, result: { content_task_id: task.id } };
  },

  async criar_card_design(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'criar_cards', { clientId: p.client_id });
    const description = [`🤖 Pedido pelo PULSE (WhatsApp) — ${requesterName(number)}`, p.descricao].filter(Boolean).join('\n\n');
    const { rows: [task] } = await pool.query(
      `INSERT INTO design_tasks (client_id, title, format_type, priority, copy_text, description, due_date, created_by, kanban_column, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'nova_tarefa', 0) RETURNING id`,
      [client.id, p.titulo, p.formato, p.prioridade, p.texto_da_arte || null, description, p.prazo ? `${p.prazo}T12:00:00-03:00` : null, number.user_id || null]
    );
    await pool.query('INSERT INTO design_task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)',
      [task.id, '🤖 Card criado pelo PULSE (WhatsApp)', `Pedido por ${requesterName(number)}`, number.user_id || null]).catch(() => {});
    await pool.query(`SELECT notify_role('designer'::app_role, 'Nova tarefa de design', $1, 'design', '/designer')`, [`Nova tarefa: ${p.titulo}`])
      .catch((error) => console.error('[assistente] aviso aos designers:', error.message));
    await linkDemand(pool, p.demanda_id, 'design', task.id);
    return { message: `✅ Card criado no Kanban de design (Nova tarefa): '${p.titulo}' — ${client.company_name}.`, result: { design_task_id: task.id } };
  },

  async pedir_relatorio(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'relatorios', { clientId: p.client_id });
    const { rows: [open] } = await pool.query(
      `SELECT id FROM agent_jobs WHERE type = 'relatorio_mensal' AND client_id = $1 AND params->>'month' = $2 AND status IN ('pendente', 'em_andamento') LIMIT 1`,
      [client.id, p.mes]
    );
    if (open) return { message: `Já existe um pedido em andamento para o relatório de ${client.company_name} de ${monthLabel(p.mes)}. Aviso aqui quando ficar pronto.`, result: { job_id: open.id, ja_existia: true } };
    const { rows: [job] } = await pool.query(
      `INSERT INTO agent_jobs (type, client_id, params, requested_by_number, requested_by_user, requested_by_name)
       VALUES ('relatorio_mensal', $1, $2, $3, $4, $5) RETURNING id`,
      [client.id, JSON.stringify({ month: p.mes, theme: REPORT_THEME, template_path: REPORT_TEMPLATE_PATH }), number.id, number.user_id || null, requesterName(number)]
    );
    return { message: `✅ Pedido feito: relatório de ${client.company_name} de ${monthLabel(p.mes)}. O agente do PC gera e eu aviso aqui quando ficar pronto.`, result: { job_id: job.id } };
  },

  async enviar_cliente(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'enviar_cliente', { clientId: p.client_id });
    const purpose = p.cobranca ? 'cobranca' : 'geral';
    const target = clientTarget(client, purpose);
    if (!target) throw new Error(`${client.company_name} não tem ${p.cobranca ? 'WhatsApp' : 'grupo nem WhatsApp'} cadastrado.`);
    const queued = await enqueueWhatsApp(pool, {
      to: target, body: p.mensagem, purpose, triggerType: 'assistente', clientId: client.id, sentBy: number.user_id || null,
      mediaUrl: p.arquivo_url || undefined, mediaName: p.arquivo_nome || undefined,
    });
    const where = p.cobranca ? 'no privado' : client.whatsapp_group ? 'no grupo' : 'no WhatsApp';
    return { message: `✅ Mensagem na fila para ${client.company_name} (${where}).`, result: { outbox_id: queued.id } };
  },

  async enviar_relatorio(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'enviar_cliente', { clientId: p.client_id });
    const { rows: [job] } = await pool.query(`SELECT * FROM agent_jobs WHERE id = $1`, [p.job_id]);
    if (!job || job.status !== 'entregue') throw new Error('O relatório não está mais disponível.');
    const files = Array.isArray(job.files) ? job.files : [];
    const file = files.find((f) => /\.pdf$/i.test(f.name || f.url)) || files[0];
    if (!file) throw new Error('O relatório entregue não tem arquivo.');
    const target = clientTarget(client, 'geral');
    if (!target) throw new Error(`${client.company_name} não tem grupo nem WhatsApp cadastrado.`);
    const ext = (String(file.name || file.url).match(/\.[a-z0-9]+$/i) || ['.pdf'])[0];
    const queued = await enqueueWhatsApp(pool, {
      to: target, body: `Olá! Segue o relatório de ${monthLabel(p.mes)} da ${client.company_name}. 📊`, purpose: 'geral', triggerType: 'assistente',
      clientId: client.id, sentBy: number.user_id || null, mediaUrl: file.url, mediaName: `Relatório ${client.company_name} ${monthLabel(p.mes).replace('/', '-')}${ext}`,
    });
    await pool.query(`UPDATE agent_jobs SET sent_to_client_at = now(), updated_at = now() WHERE id = $1`, [job.id]);
    return { message: `✅ Relatório na fila para ${client.company_name} (${client.whatsapp_group ? 'no grupo' : 'no WhatsApp'}).`, result: { outbox_id: queued.id } };
  },
};

async function linkDemand(pool, demandId, kind, cardId) {
  if (!isUuid(demandId)) return;
  await pool.query(
    `UPDATE assistant_demands SET status = 'card_criado', card_kind = $2, card_id = $3, updated_at = now() WHERE id = $1`,
    [demandId, kind, cardId]
  ).catch(() => {});
}

/**
 * "sim": executa o payload guardado. A ação é reservada antes (status 'executando'), então dois "sim" seguidos
 * não executam duas vezes. Devolve a mensagem para quem pediu.
 */
export async function executeAction(pool, actionId) {
  const { rows: [action] } = await pool.query(
    `UPDATE assistant_pending_actions SET status = 'executando', decided_at = now()
      WHERE id = $1 AND status = 'pendente' AND expires_at > now() RETURNING *`, [actionId]
  );
  if (!action) return { ok: false, message: 'Essa confirmação não vale mais (expirou ou já foi usada). Me peça de novo.' };
  const run = EXECUTORS[action.kind];
  try {
    if (!run) throw new Error(`Ação desconhecida: ${action.kind}`);
    const { message, result } = await run(pool, action);
    await pool.query(`UPDATE assistant_pending_actions SET status = 'executada', result = $2 WHERE id = $1`, [action.id, JSON.stringify(result || {})]);
    await logEvent(pool, { numberId: action.number_id, kind: 'acao', tool: action.kind, text: action.summary, detail: result });
    return { ok: true, message, result };
  } catch (error) {
    await pool.query(`UPDATE assistant_pending_actions SET status = 'falhou', result = $2 WHERE id = $1`, [action.id, JSON.stringify({ error: error.message })]);
    await logEvent(pool, { numberId: action.number_id, kind: error.permission ? 'negado' : 'erro', tool: action.kind, text: action.summary, detail: { error: error.message } });
    return { ok: false, message: `❌ Não deu para fazer: ${error.message}` };
  }
}

export async function cancelAction(pool, actionId) {
  const { rows: [action] } = await pool.query(
    `UPDATE assistant_pending_actions SET status = 'cancelada', decided_at = now() WHERE id = $1 AND status = 'pendente' RETURNING *`, [actionId]
  );
  if (action) await logEvent(pool, { numberId: action.number_id, kind: 'cancelado', tool: action.kind, text: action.summary });
  return action;
}

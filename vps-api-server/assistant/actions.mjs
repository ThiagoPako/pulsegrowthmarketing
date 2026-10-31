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
//   agentes  → agent_messages (recado que o agente lê no "esperar") e agent_pauses (pausar/retomar), como a tela de Agentes
//   cards    → fluxo de edição pela mesma função da chefe (moveEditCard); campos do card e Kanban de design como a tela
//   cliente  → clients (campos da edição do cadastro; pré-cadastro com o padrão da tela)
//   agenda   → recordings (marcar, remarcar, cancelar), como /api/recordings
//
// Confirmação pela clareza do pedido: a ferramenta diz se o pedido veio claro ou com dúvida. Claro → executa na hora;
// dúvida → resumo pedindo "sim". O que sai para o cliente (ALWAYS_CONFIRM) pede "sim" sempre.

import { enqueueWhatsApp, clientTarget } from '../whatsapp/shared.mjs';
import { materialsByCode, saveMaterialsToDrive, removeMaterialFiles } from './materials.mjs';
import { driveIdFromLink, folderUrl } from '../lib/driveFolders.mjs';
import {
  CONFIRM_MINUTES, cityLabel, clientAllowed, fmtDate, fmtMoney, monthLabel, clip, requesterName, getNumber, logEvent,
} from './common.mjs';

export const REPORT_THEME = 'novembro-azul-labovitta';
export const REPORT_TEMPLATE_PATH = 'clientes/labo-vitta/design/apresentacoes/2026-10-20-novembro-azul';

export const CONTENT_TYPES = { reels: 'Reels', criativo: 'Criativo', story: 'Story', arte: 'Arte', otimizacao: 'Otimização' };
export const DESIGN_FORMATS = { feed: 'Feed', story: 'Story', logomarca: 'Logomarca', midia_fisica: 'Mídia física', carrossel: 'Carrossel', capa: 'Capa', thumbnail: 'Thumbnail' };
export const DESIGN_PRIORITIES = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
export const CONTENT_COLUMNS = {
  ideias: 'Ideias', captacao: 'Captação', edicao: 'Edição', pre_revisao: 'Pré-revisão', revisao: 'Revisão',
  alteracao: 'Alteração', envio: 'Envio', agendamentos: 'Agendamentos', acompanhamento: 'Acompanhamento',
};
export const DESIGN_COLUMNS = {
  nova_tarefa: 'Nova tarefa', executando: 'Executando', fila_baixa_prioridade: 'Fila de baixa prioridade', ajustes: 'Ajustes',
  analise_ia: 'Análise IA', em_analise: 'Em análise', enviar_cliente: 'Enviar ao cliente', aprovado: 'Aprovado', postado: 'Postado',
};
export const RECORDING_TYPES = { fixa: 'Fixa', extra: 'Extra', avulso: 'Avulsa' };

/** Sai para o cliente: pede "sim" mesmo com pedido claro. */
export const ALWAYS_CONFIRM = new Set(['enviar_cliente', 'enviar_relatorio', 'guardar_material']);

// Dependências do servidor (registerAssistant): movimentação de card do fluxo de edição
let deps = {};
export function configureActions(next) { deps = { ...deps, ...next }; }

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
  guardar_material: (p) => `Guardar no Drive de ${p.cliente} e criar ${p.videos.length} card(s) em Edição:\n${p.videos.map((v) => `• '${v.titulo}' (${CONTENT_TYPES[v.tipo] || v.tipo}) · ${v.arquivos.join(', ')}${v.roteiro ? ' · com roteiro' : ' · sem roteiro'}`).join('\n')}`,
  lancar_despesa: (p) => `Despesa ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)} · ${p.categoria} · ${fmtDate(p.data)} · '${p.descricao}'${p.tipo === 'variavel' ? ' · variável' : ''}`,
  lancar_receita: (p) => `Receita ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)}${p.cliente ? ` · ${p.cliente}` : ' · sem cliente'} · vence ${fmtDate(p.vencimento)} · ${REVENUE_CATEGORIES[p.categoria] || p.categoria}${p.descricao ? ` · '${p.descricao}'` : ''}${p.recebida ? ' · já recebida' : ' · a receber'}`,
  criar_card_video: (p) => `Card de vídeo (${CONTENT_TYPES[p.tipo] || p.tipo}) · ${p.cliente} (${cityLabel(p.cidade)}) · '${p.titulo}' · Kanban de conteúdo, coluna Ideias${p.descricao ? `\n📝 ${clip(p.descricao, 300)}` : ''}`,
  criar_card_design: (p) => `Card de design (${DESIGN_FORMATS[p.formato] || p.formato}) · ${p.cliente} (${cityLabel(p.cidade)}) · '${p.titulo}' · prioridade ${DESIGN_PRIORITIES[p.prioridade] || p.prioridade}${p.prazo ? ` · prazo ${fmtDate(p.prazo)}` : ''}${p.descricao ? `\n📝 ${clip(p.descricao, 300)}` : ''}`,
  pedir_relatorio: (p) => `Pedir o relatório mensal de ${p.cliente} (${cityLabel(p.cidade)}) · ${monthLabel(p.mes)} · tema Novembro Azul (Labovitta) · gerado pelo agente do PC`,
  enviar_cliente: (p) => `${p.cobranca ? 'Cobrança no privado' : 'Mensagem no grupo'} de ${p.cliente} (${cityLabel(p.cidade)}):\n"${clip(p.mensagem, 600)}"${p.arquivo_url ? `\n📎 ${p.arquivo_nome || p.arquivo_url}` : ''}`,
  enviar_relatorio: (p) => `Enviar o relatório de ${monthLabel(p.mes)} no WhatsApp de ${p.cliente} (${cityLabel(p.cidade)})`,
  recado_agente: (p) => `Recado para ${p.agentes.join(', ')}:\n"${clip(p.recado, 600)}"`,
  pausar_agentes: (p) => `${p.pausar ? 'Pausar' : 'Retomar'} ${p.agente || 'todos os agentes'}${p.motivo ? ` · '${clip(p.motivo, 200)}'` : ''}`,
  mover_card_video: (p) => `Card de vídeo '${p.titulo}' (${p.cliente || 'sem cliente'}) · ${CONTENT_COLUMNS[p.de] || p.de} → ${CONTENT_COLUMNS[p.coluna]}${p.ajustes ? `\n📝 Ajustes: ${clip(p.ajustes, 400)}` : ''}`,
  editar_card_video: (p) => `Card de vídeo '${p.titulo}' (${p.cliente || 'sem cliente'}): ${p.mudancas.join(' · ')}`,
  mover_card_design: (p) => `Card de design '${p.titulo}' (${p.cliente}) · ${DESIGN_COLUMNS[p.de] || p.de} → ${DESIGN_COLUMNS[p.coluna]}${p.ajustes ? `\n📝 Ajustes: ${clip(p.ajustes, 400)}` : ''}`,
  editar_card_design: (p) => `Card de design '${p.titulo}' (${p.cliente}): ${p.mudancas.join(' · ')}`,
  atualizar_cliente: (p) => `Cadastro de ${p.cliente}: ${p.mudancas.join(' · ')}`,
  cadastrar_cliente: (p) => `Pré-cadastro de cliente: ${p.nome} · ${cityLabel(p.cidade)}${p.responsavel ? ` · resp. ${p.responsavel}` : ''}${p.whatsapp ? ` · WhatsApp ${p.whatsapp}` : ''}${p.nicho ? ` · ${p.nicho}` : ''}`,
  marcar_gravacao: (p) => `Gravação ${RECORDING_TYPES[p.tipo] || p.tipo} · ${p.cliente} · ${fmtDate(p.data)} às ${p.hora} · videomaker ${p.videomaker}`,
  remarcar_gravacao: (p) => `Remarcar gravação de ${p.cliente}: ${fmtDate(p.de_data)} ${p.de_hora} → ${fmtDate(p.data)} às ${p.hora}${p.videomaker_mudou ? ` · videomaker ${p.videomaker}` : ''}`,
  cancelar_gravacao: (p) => `Cancelar gravação de ${p.cliente} · ${fmtDate(p.data)} às ${p.hora}${p.videomaker ? ` · ${p.videomaker}` : ''}`,
};

/**
 * Guarda uma ação esperando o "sim" (substitui a que estava esperando, se houver). Devolve a ação.
 * source: comando (pedido pelo WhatsApp), alerta (sugestão do monitor de grupos), entrega (relatório pronto)
 */
export async function proposeAction(pool, number, kind, payload, { source = 'comando', supersede = true } = {}) {
  const summary = SUMMARIES[kind](payload);
  // supersede = false: outra ação do mesmo pedido (várias esperando o mesmo "sim") ou ação clara que já vai rodar
  if (supersede) {
    await pool.query(
      `UPDATE assistant_pending_actions SET status = 'substituida', decided_at = now() WHERE number_id = $1 AND status = 'pendente'`,
      [number.id]
    );
  }
  const { rows } = await pool.query(
    `INSERT INTO assistant_pending_actions (number_id, kind, payload, summary, source, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval) RETURNING *`,
    [number.id, kind, JSON.stringify(payload), summary, source, String(CONFIRM_MINUTES)]
  );
  await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'acao_proposta', tool: kind, text: summary, detail: { action_id: rows[0].id, source } });
  return rows[0];
}

// a pergunta em si vai na enquete logo depois (confirmPoll); "sim"/"não" por escrito também vale
export const confirmQuestion = (summary) => `${summary}\n\nToque na enquete abaixo para confirmar.`;
export const confirmManyQuestion = (summaries) => `${summaries.map((s, i) => `*${i + 1}.* ${s}`).join('\n\n')}\n\nToque na enquete abaixo para confirmar tudo.`;

// ── Execução do payload guardado ──
const EXECUTORS = {
  // material encaminhado → pasta do cliente no Drive (uma subpasta por vídeo) + card em Edição com o link e o roteiro
  async guardar_material(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'criar_cards', { clientId: p.client_id });
    const folderId = driveIdFromLink(p.drive_link);
    if (!folderId) throw new Error('O link do Drive do cliente não é de uma pasta.');
    const linhas = [];
    const cards = [];
    for (const v of p.videos) {
      const materiais = await materialsByCode(pool, number.id, v.arquivos);
      if (!materiais.length) { linhas.push(`⚠ '${v.titulo}': os arquivos já tinham sido guardados ou expiraram.`); continue; }
      const { folderId: pasta } = await saveMaterialsToDrive(folderId, v.titulo, materiais);
      const link = folderUrl(pasta);
      const description = [`Material encaminhado pelo WhatsApp — ${requesterName(number)}`, v.roteiro ? `ROTEIRO:\n${v.roteiro}` : ''].filter(Boolean).join('\n\n');
      const { rows: [task] } = await pool.query(
        `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, drive_link, created_by, position, updated_at)
         VALUES ($1, $2, $3, 'edicao', $4, $5, $6, (SELECT count(*) FROM content_tasks WHERE kanban_column = 'edicao'), now())
         RETURNING id`,
        [client.id, v.titulo, v.tipo, description, link, number.user_id || null]
      );
      await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [task.id, number.user_id || null, 'Card criado pelo WhatsApp (material encaminhado)', `Pedido por ${requesterName(number)} · ${materiais.length} arquivo(s) no Drive`]).catch(() => {});
      await pool.query(
        `UPDATE assistant_materials SET status = 'guardado', client_id = $2, content_task_id = $3, drive_path = $4, updated_at = now() WHERE id = ANY($1::uuid[])`,
        [materiais.map((m) => m.id), client.id, task.id, link]
      );
      await removeMaterialFiles(materiais);
      cards.push(task.id);
      linhas.push(`✅ '${v.titulo}': ${materiais.length} arquivo(s) no Drive e card em Edição.`);
    }
    return { message: `${linhas.join('\n')}\n📁 ${client.company_name} · a edição já pode pegar.`, result: { content_task_ids: cards } };
  },

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
          `Registrou despesa - R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} - ${p.descricao}`,
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
          `Registrou receita - R$ ${Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          JSON.stringify({ ...p, origem: 'assistente_pulse', numero: number.name }), revenue.city || p.cidade]
      );
      return { message: `✅ Receita lançada: ${fmtMoney(p.valor)} · ${cityLabel(p.cidade)}${client ? ` · ${client.company_name}` : ''} · ${p.recebida ? 'recebida' : `vence ${fmtDate(p.vencimento)}`}.`, result: { revenue_id: revenue.id } };
    });
  },

  async criar_card_video(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'criar_cards', { clientId: p.client_id });
    // Texto neutro (a equipe sem Pulse Plus não vê o PULSE): a origem fica no registro do assistente
    // (assistant_log, ação executada com o id do card), que só a tela do PULSE mostra.
    const description = [`Pedido pelo WhatsApp — ${requesterName(number)}`, p.descricao].filter(Boolean).join('\n\n');
    const { rows: [task] } = await pool.query(
      `INSERT INTO content_tasks (client_id, title, content_type, kanban_column, description, created_by, position, updated_at)
       VALUES ($1, $2, $3, 'ideias', $4, $5, (SELECT count(*) FROM content_tasks WHERE kanban_column = 'ideias'), now())
       RETURNING id`,
      [client.id, p.titulo, p.tipo, description, number.user_id || null]
    );
    await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [task.id, number.user_id || null, 'Card criado pelo WhatsApp', `Pedido por ${requesterName(number)}`]).catch(() => {});
    await linkDemand(pool, p.demanda_id, 'video', task.id);
    return { message: `✅ Card criado no Kanban de conteúdo (Ideias): '${p.titulo}' — ${client.company_name}.`, result: { content_task_id: task.id } };
  },

  async criar_card_design(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'criar_cards', { clientId: p.client_id });
    const description = [`Pedido pelo WhatsApp — ${requesterName(number)}`, p.descricao].filter(Boolean).join('\n\n');
    const { rows: [task] } = await pool.query(
      `INSERT INTO design_tasks (client_id, title, format_type, priority, copy_text, description, due_date, created_by, kanban_column, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'nova_tarefa', 0) RETURNING id`,
      [client.id, p.titulo, p.formato, p.prioridade, p.texto_da_arte || null, description, p.prazo ? `${p.prazo}T12:00:00-03:00` : null, number.user_id || null]
    );
    await pool.query('INSERT INTO design_task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)',
      [task.id, 'Card criado pelo WhatsApp', `Pedido por ${requesterName(number)}`, number.user_id || null]).catch(() => {});
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

  async recado_agente(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'comandar_agentes');
    const { rows: active } = await pool.query(
      `SELECT DISTINCT user_id FROM agent_keys WHERE revoked_at IS NULL AND user_id = ANY($1::uuid[])`, [p.agente_ids]
    );
    if (!active.length) throw new Error('Esse agente não está mais conectado (chave revogada).');
    const body = `[Ordem pelo WhatsApp · ${requesterName(number)}] ${p.recado}`;
    for (const { user_id } of active) {
      await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [number.user_id || null, user_id, body]);
    }
    return { message: `✅ Recado entregue para ${p.agentes.join(', ')}. ${active.length > 1 ? 'Eles leem' : 'Lê'} na próxima checagem da caixa de recados.`, result: { agentes: p.agente_ids } };
  },

  async pausar_agentes(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'comandar_agentes');
    if (p.pausar) {
      await pool.query(
        `INSERT INTO agent_pauses (scope, paused_by, reason) VALUES ($1, $2, $3)
         ON CONFLICT (scope) DO UPDATE SET paused_by = EXCLUDED.paused_by, reason = EXCLUDED.reason, paused_at = now()`,
        [p.scope, number.user_id || null, p.motivo || `Pausado pelo WhatsApp (${requesterName(number)})`]
      );
      return { message: `⏸️ ${p.agente || 'Todos os agentes'} ${p.scope === 'all' ? 'pausados' : 'pausado'}: não pegam card novo até retomar.`, result: { scope: p.scope } };
    }
    await pool.query('DELETE FROM agent_pauses WHERE scope = $1', [p.scope]);
    return { message: `▶️ ${p.agente || 'Todos os agentes'} ${p.scope === 'all' ? 'retomados' : 'retomado'}.`, result: { scope: p.scope } };
  },

  async mover_card_video(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'editar_cards', p.client_id ? { clientId: p.client_id } : {});
    if (!deps.moveEditCard) throw new Error('Movimentação de card indisponível no servidor.');
    let moved;
    try {
      moved = await deps.moveEditCard(p.task_id, p.coluna, {
        userId: number.user_id || null, reason: `Pelo WhatsApp (PULSE) — ${requesterName(number)}${p.motivo ? `: ${p.motivo}` : ''}`, notes: p.ajustes || null,
      });
    } catch (error) {
      if (error.status && error.status < 500) throw new Error(error.message);
      throw error;
    }
    return { message: `✅ '${p.titulo}' foi para ${CONTENT_COLUMNS[p.coluna]}.`, result: moved };
  },

  async editar_card_video(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'editar_cards', p.client_id ? { clientId: p.client_id } : {});
    const keys = Object.keys(p.set);
    const { rowCount } = await pool.query(
      `UPDATE content_tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [p.task_id, ...keys.map((k) => p.set[k])]
    );
    if (!rowCount) throw new Error('O card não existe mais.');
    await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [p.task_id, number.user_id || null, 'Card atualizado pelo WhatsApp', `${p.mudancas.join(' · ')} — ${requesterName(number)}`]).catch(() => {});
    return { message: `✅ Card '${p.titulo}' atualizado: ${p.mudancas.join(' · ')}.`, result: { content_task_id: p.task_id } };
  },

  async mover_card_design(pool, action) {
    const p = action.payload;
    const { number, client } = await recheck(pool, action.number_id, 'editar_cards', { clientId: p.client_id });
    return inTransaction(pool, async (db) => {
      const { rows: [task] } = await db.query('SELECT * FROM design_tasks WHERE id = $1 FOR UPDATE', [p.task_id]);
      if (!task) throw new Error('O card não existe mais.');
      if (task.kanban_column === p.coluna && !p.ajustes) return { message: `O card '${p.titulo}' já está em ${DESIGN_COLUMNS[p.coluna]}.`, result: { design_task_id: task.id } };
      // mesmos efeitos de src/pages/DesignerKanban.tsx ao mover
      const set = { kanban_column: p.coluna };
      if ('agent_step' in task && task.agent_step) { set.agent_step = null; set.agent_heartbeat_at = null; }
      if (task.timer_running && task.timer_started_at) {
        set.time_spent_seconds = (task.time_spent_seconds || 0) + Math.max(0, Math.floor((Date.now() - new Date(task.timer_started_at).getTime()) / 1000));
        set.timer_running = false;
        set.timer_started_at = null;
      }
      const hasArt = !!(task.attachment_url || task.mockup_url);
      if (p.coluna === 'em_analise') {
        if (!hasArt) throw new Error('A arte ou o mockup precisa estar anexado antes de ir para Em análise.');
        set.due_date = null;
      }
      if (p.coluna === 'enviar_cliente' && !task.sent_to_client_at) set.sent_to_client_at = new Date().toISOString();
      if (p.coluna === 'aprovado') {
        set.completed_at = new Date().toISOString();
        set.client_approved_at = new Date().toISOString();
        if (task.format_type === 'logomarca' && hasArt) {
          await db.query('UPDATE clients SET drive_identidade_visual = $2 WHERE id = $1', [client.id, task.attachment_url || task.mockup_url]);
        }
      }
      if (p.ajustes) {
        const line = `✏️ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — Ajustes pedidos pelo WhatsApp (${requesterName(number)}): ${p.ajustes}`;
        set.observations = `${task.observations ? `${task.observations}\n\n` : ''}${line}`;
      }
      const keys = Object.keys(set);
      await db.query(
        `UPDATE design_tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [task.id, ...keys.map((k) => set[k])]
      );
      await db.query('INSERT INTO design_task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)',
        [task.id, `Movido para ${DESIGN_COLUMNS[p.coluna]}`, [`Pelo WhatsApp — ${requesterName(number)}`, p.ajustes ? `Ajustes: ${p.ajustes}` : null].filter(Boolean).join(' · '), number.user_id || null]);
      if (p.coluna === 'ajustes' && task.assigned_to) {
        await db.query(`SELECT notify_user($1, $2, $3, 'adjustment', '/designer')`, [task.assigned_to, 'Ajuste na arte', `"${task.title}" precisa de ajustes`]).catch(() => {});
      }
      return { message: `✅ '${p.titulo}' foi para ${DESIGN_COLUMNS[p.coluna]}.`, result: { design_task_id: task.id } };
    });
  },

  async editar_card_design(pool, action) {
    const p = action.payload;
    const { number } = await recheck(pool, action.number_id, 'editar_cards', { clientId: p.client_id });
    const keys = Object.keys(p.set);
    const { rowCount } = await pool.query(
      `UPDATE design_tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [p.task_id, ...keys.map((k) => p.set[k])]
    );
    if (!rowCount) throw new Error('O card não existe mais.');
    await pool.query('INSERT INTO design_task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, $4)',
      [p.task_id, 'Card atualizado pelo WhatsApp', `${p.mudancas.join(' · ')} — ${requesterName(number)}`, number.user_id || null]).catch(() => {});
    if (p.set.assigned_to) {
      await pool.query(`SELECT notify_user($1, $2, $3, 'design', '/designer')`, [p.set.assigned_to, 'Tarefa de design para você', `"${p.titulo}"`]).catch(() => {});
    }
    return { message: `✅ Card '${p.titulo}' atualizado: ${p.mudancas.join(' · ')}.`, result: { design_task_id: p.task_id } };
  },

  async atualizar_cliente(pool, action) {
    const p = action.payload;
    await recheck(pool, action.number_id, 'cadastro_clientes', { clientId: p.client_id });
    const keys = Object.keys(p.set);
    await pool.query(
      `UPDATE clients SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
      [p.client_id, ...keys.map((k) => p.set[k])]
    );
    return { message: `✅ Cadastro de ${p.cliente} atualizado: ${p.mudancas.join(' · ')}.`, result: { client_id: p.client_id } };
  },

  async cadastrar_cliente(pool, action) {
    const p = action.payload;
    await recheck(pool, action.number_id, 'cadastro_clientes', { city: p.cidade });
    const { rows: [dup] } = await pool.query(`SELECT id FROM clients WHERE lower(btrim(company_name)) = lower(btrim($1)) LIMIT 1`, [p.nome]);
    if (dup) throw new Error(`Já existe um cliente chamado "${p.nome}".`);
    const { rows: [client] } = await pool.query(
      `INSERT INTO clients (company_name, responsible_person, phone, whatsapp, email, city, niche, client_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'novo') RETURNING id`,
      [p.nome, p.responsavel || '', p.whatsapp || '', p.whatsapp || '', p.email || '', p.cidade, p.nicho || '']
    );
    return { message: `✅ ${p.nome} pré-cadastrado em ${cityLabel(p.cidade)}. Plano, contrato, dias de gravação e metas: complete na tela de Clientes.`, result: { client_id: client.id } };
  },

  async marcar_gravacao(pool, action) {
    const p = action.payload;
    await recheck(pool, action.number_id, 'agenda', { clientId: p.client_id });
    const conflict = await recordingConflict(pool, p);
    if (conflict) throw new Error(conflict);
    const { rows: [rec] } = await pool.query(
      `INSERT INTO recordings (client_id, videomaker_id, date, start_time, type, status, confirmation_status, city)
       VALUES ($1, $2, $3, $4, $5, 'agendada', 'pendente', $6) RETURNING id`,
      [p.client_id, p.videomaker_id, p.data, p.hora, p.tipo, p.cidade]
    );
    return { message: `✅ Gravação marcada: ${p.cliente} · ${fmtDate(p.data)} às ${p.hora} · ${p.videomaker}.`, result: { recording_id: rec.id } };
  },

  async remarcar_gravacao(pool, action) {
    const p = action.payload;
    await recheck(pool, action.number_id, 'agenda', { clientId: p.client_id });
    const conflict = await recordingConflict(pool, { ...p, excludeId: p.recording_id });
    if (conflict) throw new Error(conflict);
    const { rowCount } = await pool.query(
      `UPDATE recordings SET date = $2, start_time = $3, videomaker_id = $4, confirmation_status = 'pendente'
        WHERE id = $1 AND status NOT IN ('cancelada', 'concluida')`,
      [p.recording_id, p.data, p.hora, p.videomaker_id]
    );
    if (!rowCount) throw new Error('A gravação não está mais agendada (foi cancelada ou já aconteceu).');
    return { message: `✅ Gravação de ${p.cliente} remarcada para ${fmtDate(p.data)} às ${p.hora}${p.videomaker_mudou ? ` com ${p.videomaker}` : ''}.`, result: { recording_id: p.recording_id } };
  },

  async cancelar_gravacao(pool, action) {
    const p = action.payload;
    await recheck(pool, action.number_id, 'agenda', { clientId: p.client_id });
    const { rowCount } = await pool.query(
      `UPDATE recordings SET status = 'cancelada' WHERE id = $1 AND status NOT IN ('cancelada', 'concluida')`, [p.recording_id]
    );
    if (!rowCount) throw new Error('A gravação já estava cancelada ou já aconteceu.');
    return { message: `✅ Gravação de ${p.cliente} de ${fmtDate(p.data)} às ${p.hora} cancelada.`, result: { recording_id: p.recording_id } };
  },
};

/** Mesmas regras da tela (AppContext.hasConflict): cliente com uma gravação por dia e videomaker sem horário encavalado. */
export async function recordingConflict(pool, { client_id, videomaker_id, data, hora, excludeId = null }) {
  const { rows: [settings] } = await pool.query('SELECT recording_duration FROM company_settings LIMIT 1').catch(() => ({ rows: [] }));
  const raw = Number(settings?.recording_duration) || 2;
  const duration = raw > 10 ? raw : raw * 60; // horas (2) ou minutos (90), como o check_availability do servidor
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const start = toMin(hora);
  const { rows } = await pool.query(
    `SELECT r.id, r.client_id, r.videomaker_id, r.start_time, c.company_name FROM recordings r LEFT JOIN clients c ON c.id = r.client_id
      WHERE r.date = $1::date AND r.status <> 'cancelada' AND ($2::uuid IS NULL OR r.id <> $2) AND (r.client_id = $3 OR r.videomaker_id = $4)`,
    [data, excludeId, client_id, videomaker_id]
  );
  const sameClient = rows.find((r) => r.client_id === client_id);
  if (sameClient) return `Esse cliente já tem gravação nesse dia (às ${sameClient.start_time}).`;
  const clash = rows.find((r) => r.videomaker_id === videomaker_id && Math.abs(toMin(r.start_time) - start) < duration);
  if (clash) return `O videomaker já tem gravação às ${clash.start_time} nesse dia (${clash.company_name || 'avulsa'}).`;
  return null;
}


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
  if (action) {
    await logEvent(pool, { numberId: action.number_id, kind: 'cancelado', tool: action.kind, text: action.summary });
    // "não" à sugestão do aviso de demanda: a demanda fica como ignorada (se ninguém criou card para ela)
    if (action.source === 'alerta' && isUuid(action.payload?.demanda_id)) {
      await pool.query(`UPDATE assistant_demands SET status = 'ignorada', updated_at = now() WHERE id = $1 AND status = 'nova'`, [action.payload.demanda_id]).catch(() => {});
    }
  }
  return action;
}

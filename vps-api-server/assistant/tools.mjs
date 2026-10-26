// Assistente PULSE — ferramentas do Claude.
//
// Cada ferramenta declara a permissão que exige; o modelo só recebe as ferramentas do número e, mesmo assim, toda
// chamada é conferida aqui (permissão + cidade) antes de rodar — o servidor nunca confia no modelo.
// Consultas respondem direto. Ferramentas de ação NÃO executam: só registram a proposta (turn.propose) e o motor
// manda o resumo pedindo "sim" (ver actions.mjs).

import { clientTarget } from '../whatsapp/shared.mjs';
import {
  CITIES, PERMISSIONS, cityExpr, cityLabel, clientAllowed, clientCity, norm, clip, brazilToday, brazilMonth, isIsoDate,
  isMonth, addDays, fmtDate, monthLabel, roundMoney, logEvent,
} from './common.mjs';
import { financialSummary, delinquents } from './finance.mjs';
import {
  CONTENT_TYPES, DESIGN_FORMATS, DESIGN_PRIORITIES, REVENUE_CATEGORIES, SUMMARIES, loadClient, isUuid,
} from './actions.mjs';

const CONTENT_COLUMNS = {
  ideias: 'Ideias', captacao: 'Captação', edicao: 'Edição', pre_revisao: 'Pré-revisão', revisao: 'Revisão',
  alteracao: 'Alteração', envio: 'Envio', agendamentos: 'Agendamentos', acompanhamento: 'Acompanhamento',
};
const DESIGN_COLUMNS = {
  nova_tarefa: 'Nova tarefa', executando: 'Executando', fila_baixa_prioridade: 'Fila de baixa prioridade', ajustes: 'Ajustes',
  em_analise: 'Em análise', enviar_cliente: 'Enviar ao cliente', aprovado: 'Aprovado', postado: 'Postado',
};

/** Erro de uso (dado faltando, fora da cidade…): volta ao modelo como tool_result com is_error. */
class UseError extends Error {}
const need = (condition, message) => { if (!condition) throw new UseError(message); };

// ── esquemas (strict: todo campo obrigatório; opcionais aceitam null) ──
const str = (description) => ({ type: 'string', description });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const strEnum = (values, description) => ({ type: 'string', enum: values, description });
const object = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const CITY_ONE = strEnum(Object.keys(CITIES), 'Cidade: minacu (Minaçu) ou uruacu (Uruaçu).');
const CITY_ANY = strEnum([...Object.keys(CITIES), 'todas'], 'minacu, uruacu ou todas (só se o número pode agir nas duas).');
const CLIENT_ID = str('id do cliente devolvido por buscar_cliente (uuid).');
const DATE = (description) => nullable({ type: 'string', format: 'date', description });

// ── nomes parecidos (erro de digitação) ──
function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
const ratio = (a, b) => (a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);
const simple = (text) => norm(text).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function nameScore(query, name) {
  const q = simple(query);
  const n = simple(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.includes(q) || q.includes(n)) return 0.92;
  const qt = q.split(' ').filter((t) => t.length > 1);
  const nt = n.split(' ').filter((t) => t.length > 1);
  const tokenAvg = qt.length && nt.length
    ? qt.reduce((sum, t) => sum + Math.max(...nt.map((w) => (w.startsWith(t) && t.length >= 3 ? 0.95 : ratio(t, w)))), 0) / qt.length
    : 0;
  return Math.max(ratio(q, n), tokenAvg * 0.95, ratio(q.replace(/ /g, ''), n.replace(/ /g, '')));
}

export function createTools({ pool, publicUploadsUrl }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  const ownOrigins = new Set(['https://agenciapulse.tech', 'https://www.agenciapulse.tech']);
  try { ownOrigins.add(new URL(uploadsBase).origin); } catch {}

  const citiesFor = (number, cidade) => {
    const own = number.cities || [];
    if (cidade === 'todas') { // todas = as cidades deste número
      need(own.length >= 1, 'Número sem cidade cadastrada.');
      return [...own];
    }
    need(CITIES[cidade], 'Cidade inválida: use minacu ou uruacu.');
    need(own.includes(cidade), `Este número não pode agir em ${cityLabel(cidade)} (só em ${own.map(cityLabel).join(' e ') || 'nenhuma cidade'}).`);
    return [cidade];
  };

  async function clientFor(number, id) {
    need(isUuid(id), 'cliente_id inválido: use o id devolvido por buscar_cliente.');
    const client = await loadClient(pool, id);
    need(client, 'Cliente não encontrado.');
    need(clientAllowed(number, client), `${client.company_name} é de ${cityLabel(clientCity(client))}: este número não pode agir nessa cidade.`);
    return client;
  }

  const money = (value) => {
    const n = roundMoney(value);
    need(Number.isFinite(n) && n > 0, 'Valor inválido: precisa ser maior que zero.');
    need(n < 1_000_000, 'Valor alto demais para lançar pelo WhatsApp.');
    return n;
  };
  const dateOrToday = (value, label) => {
    const d = value || brazilToday();
    need(isIsoDate(d), `${label} inválida: use AAAA-MM-DD.`);
    const today = brazilToday();
    need(d >= addDays(today, -400) && d <= addDays(today, 400), `${label} longe demais de hoje.`);
    return d;
  };
  const text = (value, max, label, { required = false } = {}) => {
    const t = clip(value, max);
    if (required) need(t.length >= 2, `${label} vazio.`);
    return t;
  };

  function absoluteUrl(url) {
    if (!url) return null;
    const s = String(url);
    if (s.startsWith('/uploads/')) return `https://agenciapulse.tech${s}`;
    if (s.startsWith('/')) return `${uploadsBase}${s}`;
    return s;
  }

  // ── Ferramentas ──
  const TOOLS = {
    buscar_cliente: {
      permission: null,
      description: 'Procura clientes pelo nome (tolera erro de digitação) nas cidades deste número. Use antes de qualquer ferramenta que peça cliente_id. Se vier mais de um parecido, pergunte qual é.',
      input_schema: object({ nome: str('Nome (ou parte do nome) do cliente, como a pessoa escreveu.') }),
      async run(number, input) {
        const q = clip(input.nome, 80);
        need(q.length >= 2, 'Diga ao menos parte do nome do cliente.');
        const { rows } = await pool.query(
          `SELECT id, company_name, city, is_admin_client, status, responsible_person, whatsapp_group FROM clients`
        );
        const found = rows.filter((c) => clientAllowed(number, c))
          .map((c) => ({ c, score: nameScore(q, c.company_name) }))
          .filter((x) => x.score >= 0.5)
          .sort((a, b) => (b.score - a.score) || ((a.c.status === 'cancelado') - (b.c.status === 'cancelado')))
          .slice(0, 5)
          .map(({ c, score }) => ({
            id: c.id, nome: c.company_name, cidade: cityLabel(clientCity(c)), responsavel: c.responsible_person || null,
            cancelado: c.status === 'cancelado', tem_grupo_whatsapp: !!String(c.whatsapp_group || '').trim(), semelhanca: Math.round(score * 100) / 100,
          }));
        return found.length ? { encontrados: found } : { encontrados: [], aviso: 'Nenhum cliente parecido nas cidades deste número.' };
      },
    },

    resumo_financeiro: {
      permission: 'consultar_financeiro',
      description: 'Resumo financeiro do mês (mesmas contas da tela Financeiro): receitas previstas, recebidas, a receber e vencidas; despesas pagas por categoria; lucro; saldo em conta e porquinho.',
      input_schema: object({ cidade: CITY_ANY, mes: nullable(str('Mês AAAA-MM (null = mês atual).')) }),
      async run(number, input) {
        const cities = citiesFor(number, input.cidade);
        const month = input.mes || brazilMonth();
        need(isMonth(month), 'Mês inválido: use AAAA-MM.');
        return { ...(await financialSummary(pool, { cities, month })), cidades: cities.map(cityLabel), mes_nome: monthLabel(month) };
      },
    },

    listar_inadimplentes: {
      permission: 'inadimplentes',
      description: 'Receitas vencidas e não pagas (régua da tela Inadimplência, a partir de 04/2026): cliente, valor, vencimento e dias de atraso, do maior atraso para o menor.',
      input_schema: object({ cidade: CITY_ANY }),
      async run(number, input) {
        const cities = citiesFor(number, input.cidade);
        return { ...(await delinquents(pool, { cities })), cidades: cities.map(cityLabel) };
      },
    },

    listar_categorias_despesa: {
      permission: 'lancar_financeiro',
      description: 'Categorias de despesa cadastradas no Financeiro (use o nome exato em lancar_despesa).',
      input_schema: object({}),
      async run() {
        const { rows } = await pool.query(`SELECT name FROM expense_categories ORDER BY name`);
        return { categorias: rows.map((r) => r.name) };
      },
    },

    lancar_despesa: {
      permission: 'lancar_financeiro',
      description: 'Prepara o lançamento de uma despesa (sem cliente). NÃO lança na hora: o sistema manda o resumo e só lança se a pessoa responder "sim". Pergunte a cidade se o número pode agir nas duas e ela não disse.',
      input_schema: object({
        cidade: CITY_ONE,
        valor: { type: 'number', description: 'Valor em reais, ex.: 350.5' },
        categoria: str('Nome da categoria de despesa (ver listar_categorias_despesa).'),
        data: DATE('Data da despesa AAAA-MM-DD (null = hoje).'),
        descricao: str('Descrição curta, com as palavras da pessoa.'),
        tipo: strEnum(['fixa', 'variavel'], 'fixa (recorrente) ou variavel (pontual).'),
      }),
      async run(number, input, turn) {
        const [cidade] = citiesFor(number, input.cidade);
        const valor = money(input.valor);
        const { rows: categories } = await pool.query(`SELECT id, name FROM expense_categories ORDER BY name`);
        need(categories.length, 'Não há categorias de despesa cadastradas.');
        const wanted = norm(input.categoria);
        const category = categories.find((c) => norm(c.name) === wanted)
          || categories.find((c) => norm(c.name).includes(wanted) && wanted.length >= 3)
          || categories.map((c) => ({ c, s: nameScore(wanted, c.name) })).filter((x) => x.s >= 0.75).sort((a, b) => b.s - a.s)[0]?.c;
        need(category, `Categoria "${clip(input.categoria, 40)}" não encontrada. Categorias: ${categories.map((c) => c.name).join(', ')}.`);
        need(!/sal[aá]rio|pr[oó][- ]?labore/i.test(category.name), 'Salário e pró-labore são lançados pela tela do Financeiro (têm regra própria).');
        const payload = {
          cidade, valor, category_id: category.id, categoria: category.name, data: dateOrToday(input.data, 'Data'),
          descricao: text(input.descricao, 300, 'Descrição') || category.name, tipo: input.tipo === 'variavel' ? 'variavel' : 'fixa',
        };
        return turn.propose('lancar_despesa', payload);
      },
    },

    lancar_receita: {
      permission: 'lancar_financeiro',
      description: 'Prepara o lançamento de uma receita avulsa (com ou sem cliente). NÃO lança na hora: o sistema manda o resumo e só lança com "sim". Com cliente, a cidade é a do cliente.',
      input_schema: object({
        cidade: nullable(CITY_ONE),
        valor: { type: 'number', description: 'Valor em reais.' },
        cliente_id: nullable(CLIENT_ID),
        vencimento: DATE('Vencimento (ou data do recebimento) AAAA-MM-DD; null = hoje.'),
        recebida: { type: 'boolean', description: 'true se o dinheiro já entrou.' },
        categoria: strEnum(Object.keys(REVENUE_CATEGORIES), 'contrato, video_unitario, edicao_videos, evento, site_sistemas ou outros.'),
        descricao: str('Descrição curta.'),
      }),
      async run(number, input, turn) {
        const valor = money(input.valor);
        let client = null;
        let cidade;
        if (input.cliente_id) {
          client = await clientFor(number, input.cliente_id);
          cidade = clientCity(client) || citiesFor(number, input.cidade || '')[0];
        } else {
          need(input.cidade, 'Sem cliente, diga a cidade da receita.');
          [cidade] = citiesFor(number, input.cidade);
        }
        need(REVENUE_CATEGORIES[input.categoria], 'Categoria de receita inválida.');
        const payload = {
          cidade, valor, client_id: client?.id || null, cliente: client?.company_name || null,
          vencimento: dateOrToday(input.vencimento, 'Vencimento'), recebida: !!input.recebida, categoria: input.categoria,
          descricao: text(input.descricao, 300, 'Descrição'),
        };
        return turn.propose('lancar_receita', payload);
      },
    },

    criar_card_video: {
      permission: 'criar_cards',
      description: 'Prepara um card no Kanban de conteúdo/vídeo (coluna Ideias). NÃO cria na hora: só com "sim".',
      input_schema: object({
        cliente_id: CLIENT_ID,
        titulo: str('Título curto do card.'),
        tipo: strEnum(Object.keys(CONTENT_TYPES), 'reels, criativo, story, arte ou otimizacao.'),
        descricao: str('O que precisa ser feito (detalhes do pedido).'),
        demanda_id: nullable(str('id da demanda detectada no grupo, se o card for para ela.')),
      }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(CONTENT_TYPES[input.tipo], 'Tipo inválido.');
        return turn.propose('criar_card_video', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client), titulo: text(input.titulo, 120, 'Título', { required: true }),
          tipo: input.tipo, descricao: text(input.descricao, 1500, 'Descrição'), demanda_id: isUuid(input.demanda_id) ? input.demanda_id : null,
        });
      },
    },

    criar_card_design: {
      permission: 'criar_cards',
      description: 'Prepara um card no Kanban de design (coluna Nova tarefa) e avisa os designers. NÃO cria na hora: só com "sim".',
      input_schema: object({
        cliente_id: CLIENT_ID,
        titulo: str('Título curto do card.'),
        formato: strEnum(Object.keys(DESIGN_FORMATS), 'feed, story, logomarca, midia_fisica, carrossel, capa ou thumbnail.'),
        prioridade: strEnum(Object.keys(DESIGN_PRIORITIES), 'baixa, media, alta ou urgente.'),
        prazo: DATE('Prazo AAAA-MM-DD (null = sem prazo).'),
        descricao: str('O que a arte precisa ter (detalhes, referências citadas).'),
        texto_da_arte: nullable(str('Texto que vai escrito na arte, se a pessoa disse.')),
        demanda_id: nullable(str('id da demanda detectada no grupo, se o card for para ela.')),
      }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(DESIGN_FORMATS[input.formato], 'Formato inválido.');
        need(DESIGN_PRIORITIES[input.prioridade], 'Prioridade inválida.');
        return turn.propose('criar_card_design', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client), titulo: text(input.titulo, 120, 'Título', { required: true }),
          formato: input.formato, prioridade: input.prioridade, prazo: input.prazo ? dateOrToday(input.prazo, 'Prazo') : null,
          descricao: text(input.descricao, 1500, 'Descrição'), texto_da_arte: input.texto_da_arte ? text(input.texto_da_arte, 1000, 'Texto') : null,
          demanda_id: isUuid(input.demanda_id) ? input.demanda_id : null,
        });
      },
    },

    andamento_producao: {
      permission: 'consultar_producao',
      description: 'Andamento da produção de um cliente: cards de conteúdo e de design por coluna, conteúdos esperando aprovação no portal e próximas gravações.',
      input_schema: object({ cliente_id: CLIENT_ID }),
      async run(number, input) {
        const client = await clientFor(number, input.cliente_id);
        const today = brazilToday();
        const [content, design, portal, recordings] = await Promise.all([
          pool.query(
            `SELECT title, content_type, kanban_column, editing_deadline, updated_at FROM content_tasks
              WHERE client_id = $1 AND kanban_column NOT IN ('arquivado', 'postado') ORDER BY updated_at DESC LIMIT 40`, [client.id]),
          pool.query(
            `SELECT title, format_type, kanban_column, priority, due_date FROM design_tasks
              WHERE client_id = $1 AND (kanban_column <> 'postado' OR updated_at > now() - interval '21 days')
              ORDER BY updated_at DESC LIMIT 40`, [client.id]),
          pool.query(`SELECT title, content_type, created_at FROM client_portal_contents WHERE client_id = $1 AND status = 'pendente' ORDER BY created_at DESC LIMIT 10`, [client.id]),
          pool.query(`SELECT date, start_time, status, type FROM recordings WHERE client_id = $1 AND date >= $2 ORDER BY date, start_time LIMIT 6`, [client.id, today]),
        ]);
        return {
          cliente: client.company_name, cidade: cityLabel(clientCity(client)),
          conteudo: content.rows.map((t) => ({ titulo: t.title, tipo: CONTENT_TYPES[t.content_type] || t.content_type, coluna: CONTENT_COLUMNS[t.kanban_column] || t.kanban_column, prazo_edicao: t.editing_deadline ? fmtDate(t.editing_deadline) : null })),
          design: design.rows.map((t) => ({ titulo: t.title, formato: DESIGN_FORMATS[t.format_type] || t.format_type, coluna: DESIGN_COLUMNS[t.kanban_column] || t.kanban_column, prioridade: t.priority, prazo: t.due_date ? fmtDate(t.due_date) : null })),
          esperando_aprovacao_no_portal: portal.rows.map((p) => ({ titulo: p.title, tipo: p.content_type, desde: fmtDate(p.created_at) })),
          proximas_gravacoes: recordings.rows.map((r) => ({ data: fmtDate(r.date), hora: r.start_time, status: r.status, tipo: r.type })),
        };
      },
    },

    agenda_gravacoes: {
      permission: 'consultar_producao',
      description: 'Agenda de gravações de um período (cliente, data, hora, videomaker, status).',
      input_schema: object({
        cidade: CITY_ANY,
        data_inicio: DATE('Primeiro dia AAAA-MM-DD (null = hoje).'),
        dias: { type: 'integer', description: 'Quantos dias a partir do início (1 a 31).' },
      }),
      async run(number, input) {
        const cities = citiesFor(number, input.cidade);
        const start = dateOrToday(input.data_inicio, 'Data');
        const days = Math.min(31, Math.max(1, Math.round(Number(input.dias) || 7)));
        const params = [start, addDays(start, days - 1)];
        let cityWhere = 'true';
        if (cities.length === 1) {
          params.push(cities[0]);
          cityWhere = `(${cityExpr('r.city')} = $3 OR r.city IS NULL OR nullif(btrim(r.city::text), '') IS NULL)`;
        }
        const { rows } = await pool.query(
          `SELECT r.date, r.start_time, r.status, r.type, r.prospect_name, c.company_name, p.name AS videomaker
             FROM recordings r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN profiles p ON p.id = r.videomaker_id
            WHERE r.date BETWEEN $1::date AND $2::date AND ${cityWhere}
            ORDER BY r.date, r.start_time LIMIT 80`, params
        );
        return {
          de: fmtDate(params[0]), ate: fmtDate(params[1]), cidades: cities.map(cityLabel),
          gravacoes: rows.map((r) => ({ data: fmtDate(r.date), hora: r.start_time, cliente: r.company_name || r.prospect_name || '—', videomaker: r.videomaker || null, status: r.status, tipo: r.type })),
        };
      },
    },

    pedir_relatorio_mensal: {
      permission: 'relatorios',
      description: 'Prepara o pedido do relatório mensal de um cliente para o agente do PC (tema Novembro Azul da Labovitta). NÃO pede na hora: só com "sim". Quando o agente entregar, aviso quem pediu.',
      input_schema: object({ cliente_id: CLIENT_ID, mes: str('Mês do relatório AAAA-MM.') }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(isMonth(input.mes), 'Mês inválido: use AAAA-MM.');
        need(input.mes <= brazilMonth() && input.mes >= '2026-03', 'Só há dados a partir de março/2026 e até o mês atual.');
        return turn.propose('pedir_relatorio', { client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mes: input.mes });
      },
    },

    pedidos_de_relatorio: {
      permission: 'relatorios',
      description: 'Situação dos pedidos de relatório mensal (pendente, em andamento, entregue, falhou).',
      input_schema: object({ cliente_id: nullable(CLIENT_ID) }),
      async run(number, input) {
        const client = input.cliente_id ? await clientFor(number, input.cliente_id) : null;
        const { rows } = await pool.query(
          `SELECT j.id, j.status, j.params, j.created_at, j.delivered_at, j.fail_reason, j.claimed_by_name, j.sent_to_client_at,
                  c.company_name, c.city, c.is_admin_client
             FROM agent_jobs j LEFT JOIN clients c ON c.id = j.client_id
            WHERE j.type = 'relatorio_mensal' AND ($1::uuid IS NULL OR j.client_id = $1)
            ORDER BY j.created_at DESC LIMIT 15`, [client?.id || null]
        );
        return {
          pedidos: rows.filter((r) => clientAllowed(number, r)).map((r) => ({
            cliente: r.company_name, mes: monthLabel(r.params?.month), status: r.status, pedido_em: fmtDate(r.created_at),
            agente: r.claimed_by_name || null, entregue_em: r.delivered_at ? fmtDate(r.delivered_at) : null,
            enviado_ao_cliente: !!r.sent_to_client_at, motivo_falha: r.fail_reason || null,
          })),
        };
      },
    },

    arquivos_do_cliente: {
      permission: 'enviar_cliente',
      description: 'Arquivos recentes de um cliente no sistema (portal, artes, relatórios entregues), com o link para usar em enviar_cliente.',
      input_schema: object({ cliente_id: CLIENT_ID }),
      async run(number, input) {
        const client = await clientFor(number, input.cliente_id);
        const [portal, design, jobs] = await Promise.all([
          pool.query(`SELECT title, content_type, file_url, created_at FROM client_portal_contents WHERE client_id = $1 AND file_url IS NOT NULL AND file_url <> '' ORDER BY created_at DESC LIMIT 10`, [client.id]),
          pool.query(`SELECT title, attachment_url, updated_at FROM design_tasks WHERE client_id = $1 AND attachment_url IS NOT NULL AND attachment_url <> '' ORDER BY updated_at DESC LIMIT 5`, [client.id]),
          pool.query(`SELECT params, files, delivered_at FROM agent_jobs WHERE client_id = $1 AND status = 'entregue' ORDER BY delivered_at DESC LIMIT 5`, [client.id]),
        ]);
        const files = [
          ...portal.rows.map((r) => ({ titulo: r.title, tipo: r.content_type || 'portal', url: absoluteUrl(r.file_url), data: fmtDate(r.created_at) })),
          ...design.rows.map((r) => ({ titulo: r.title, tipo: 'arte', url: absoluteUrl(r.attachment_url), data: fmtDate(r.updated_at) })),
          ...jobs.rows.flatMap((r) => (r.files || []).map((f) => ({ titulo: `Relatório ${monthLabel(r.params?.month)} — ${f.name || 'arquivo'}`, tipo: 'relatorio', url: f.url, data: fmtDate(r.delivered_at) }))),
        ].filter((f) => f.url);
        return { cliente: client.company_name, arquivos: files };
      },
    },

    enviar_cliente: {
      permission: 'enviar_cliente',
      description: 'Prepara uma mensagem (e, se quiser, um arquivo do sistema) para o cliente: vai no grupo do cliente; cobrança vai sempre no privado. NÃO envia na hora: só com "sim". Escreva a mensagem pronta, como a agência falaria com o cliente.',
      input_schema: object({
        cliente_id: CLIENT_ID,
        mensagem: str('Texto exato que o cliente vai receber.'),
        arquivo_url: nullable(str('Link de um arquivo do sistema (de arquivos_do_cliente).')),
        cobranca: { type: 'boolean', description: 'true se for cobrança (vai no privado do cliente).' },
      }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        const mensagem = text(input.mensagem, 3000, 'Mensagem');
        let arquivoUrl = null;
        let arquivoNome = null;
        if (input.arquivo_url) {
          let url;
          try { url = new URL(String(input.arquivo_url).trim()); } catch { url = null; }
          need(url && url.protocol === 'https:' && ownOrigins.has(url.origin), 'O arquivo precisa ser um link do próprio sistema (use arquivos_do_cliente).');
          arquivoUrl = url.href;
          arquivoNome = clip(decodeURIComponent(url.pathname.split('/').pop() || 'arquivo'), 120);
        }
        need(mensagem.length >= 2 || arquivoUrl, 'Mensagem vazia.');
        need(clientTarget(client, input.cobranca ? 'cobranca' : 'geral'), `${client.company_name} não tem ${input.cobranca ? 'WhatsApp' : 'grupo nem WhatsApp'} cadastrado.`);
        return turn.propose('enviar_cliente', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mensagem, arquivo_url: arquivoUrl, arquivo_nome: arquivoNome, cobranca: !!input.cobranca,
        });
      },
    },

    enviar_relatorio_cliente: {
      permission: 'enviar_cliente',
      description: 'Prepara o envio do relatório mensal já entregue pelo agente para o WhatsApp do cliente. NÃO envia na hora: só com "sim".',
      input_schema: object({ cliente_id: CLIENT_ID, mes: str('Mês do relatório AAAA-MM.') }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(isMonth(input.mes), 'Mês inválido: use AAAA-MM.');
        const { rows: [job] } = await pool.query(
          `SELECT id FROM agent_jobs WHERE type = 'relatorio_mensal' AND client_id = $1 AND params->>'month' = $2 AND status = 'entregue'
            ORDER BY delivered_at DESC LIMIT 1`, [client.id, input.mes]
        );
        need(job, `Não há relatório entregue de ${client.company_name} para ${monthLabel(input.mes)}.`);
        need(clientTarget(client, 'geral'), `${client.company_name} não tem grupo nem WhatsApp cadastrado.`);
        return turn.propose('enviar_relatorio', { job_id: job.id, client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mes: input.mes });
      },
    },

    demandas_recentes: {
      permission: ['alertas_grupos', 'criar_cards'],
      description: 'Demandas que os clientes pediram nos grupos e que o monitor detectou (com id para criar o card).',
      input_schema: object({ cidade: CITY_ANY }),
      async run(number, input) {
        const cities = citiesFor(number, input.cidade);
        const { rows } = await pool.query(
          `SELECT d.id, d.kind, d.summary, d.suggestion, d.status, d.created_at, c.company_name, d.cidade
             FROM assistant_demands d LEFT JOIN clients c ON c.id = d.client_id
            WHERE d.created_at > now() - interval '7 days' AND (d.cidade IS NULL OR d.cidade = ANY($1))
            ORDER BY d.created_at DESC LIMIT 15`, [cities]
        );
        return { demandas: rows.map((d) => ({ id: d.id, cliente: d.company_name, cidade: cityLabel(d.cidade), tipo: d.kind, resumo: d.summary, sugestao: d.suggestion, situacao: d.status, quando: fmtDate(d.created_at) })) };
      },
    },
  };

  const hasPermission = (number, permission) => {
    if (!permission) return true;
    const own = number.permissions || [];
    return (Array.isArray(permission) ? permission : [permission]).some((p) => own.includes(p));
  };

  /** Ferramentas que este número pode usar (o modelo só recebe estas). Ordem fixa: o prompt fica em cache. */
  function definitionsFor(number) {
    return Object.entries(TOOLS).filter(([, t]) => hasPermission(number, t.permission))
      .map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema, strict: true }));
  }

  /** Roda uma chamada do modelo. Permissão conferida aqui de novo; erro de uso volta como is_error. */
  async function execute(number, toolUse, turn) {
    const tool = TOOLS[toolUse.name];
    if (!tool) return { content: JSON.stringify({ erro: `Ferramenta desconhecida: ${toolUse.name}` }), is_error: true };
    if (!hasPermission(number, tool.permission)) {
      const perms = (Array.isArray(tool.permission) ? tool.permission : [tool.permission]).map((p) => PERMISSIONS[p] || p).join(' ou ');
      await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'negado', tool: toolUse.name, detail: { input: toolUse.input } });
      return { content: JSON.stringify({ erro: `Sem permissão: este número não pode usar "${toolUse.name}" (${perms}). Diga isso à pessoa.` }), is_error: true };
    }
    const input = toolUse.input && typeof toolUse.input === 'object' && !Array.isArray(toolUse.input) ? toolUse.input : {};
    try {
      const result = await tool.run(number, input, turn);
      await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'ferramenta', tool: toolUse.name, detail: { input } });
      return { content: JSON.stringify(result) };
    } catch (error) {
      if (error instanceof UseError) return { content: JSON.stringify({ erro: error.message }), is_error: true };
      console.error(`[assistente] ferramenta ${toolUse.name}:`, error);
      await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'erro', tool: toolUse.name, detail: { error: error.message } });
      return { content: JSON.stringify({ erro: 'Falha interna ao consultar o sistema. Diga que não conseguiu agora.' }), is_error: true };
    }
  }

  return { definitionsFor, execute, hasPermission, TOOLS };
}

/**
 * Estado de uma mensagem: no máximo uma ação proposta por pedido. A proposta só vai para o banco depois que o
 * laço termina bem (engine.mjs), para não ficar uma confirmação órfã se a IA falhar no meio.
 */
export function createTurn() {
  const turn = {
    proposal: null,
    propose(kind, payload) {
      if (turn.proposal) throw new UseError('Já existe uma ação esperando confirmação nesta mensagem: faça uma de cada vez.');
      turn.proposal = { kind, payload, summary: SUMMARIES[kind](payload) };
      return {
        status: 'aguardando_confirmacao',
        resumo: turn.proposal.summary,
        instrucao: 'O sistema manda este resumo à pessoa pedindo sim/não. Não diga que já foi feito e não repita o resumo.',
      };
    },
  };
  return turn;
}

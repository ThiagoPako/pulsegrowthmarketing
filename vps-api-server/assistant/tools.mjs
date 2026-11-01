// Assistente PULSE — ferramentas do Claude.
//
// Cada ferramenta declara a permissão que exige; o modelo só recebe as ferramentas do número e, mesmo assim, toda
// chamada é conferida aqui (permissão + cidade) antes de rodar — o servidor nunca confia no modelo.
// Consultas respondem direto. Ferramentas de ação NÃO executam: só registram a proposta (turn.propose) e o motor
// manda o resumo pedindo "sim" (ver actions.mjs).

import { clientTarget, normalizePoll } from '../whatsapp/shared.mjs';
import {
  CITIES, PERMISSIONS, cityExpr, cityLabel, clientAllowed, clientCity, norm, clip, brazilToday, brazilMonth, isIsoDate,
  isMonth, addDays, fmtDate, monthLabel, roundMoney, logEvent,
} from './common.mjs';
import { financialSummary, delinquents } from './finance.mjs';
import { materialsByCode } from './materials.mjs';
import { addInboxItem, MARCELY_RECEIVED } from './marcelyInbox.mjs';
import {
  CONTENT_TYPES, DESIGN_FORMATS, DESIGN_PRIORITIES, REVENUE_CATEGORIES, SUMMARIES, CONTENT_COLUMNS, DESIGN_COLUMNS,
  RECORDING_TYPES, ALWAYS_CONFIRM, loadClient, isUuid, recordingConflict,
} from './actions.mjs';

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
const CLAREZA = strEnum(['clara', 'duvida'],
  'clara = a pessoa disse sem ambiguidade o que fazer, em quem/qual card e com os valores; executa na hora. duvida = você deduziu algo, '
  + 'escolheu entre opções parecidas ou o áudio pode ter sido mal entendido; vai pedir "sim" antes.');

// Ferramentas novas (sem strict): campos opcionais de verdade; o servidor confere tudo em run().
const loose = (properties, required = []) => ({ type: 'object', additionalProperties: false, required, properties });
const optDate = (description) => ({ type: 'string', format: 'date', description });

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

  async function contentTaskFor(number, id) {
    need(isUuid(id), 'card_id inválido: use o devolvido por buscar_cards.');
    const { rows: [task] } = await pool.query(
      `SELECT t.*, c.company_name, c.city, c.is_admin_client FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`, [id]
    );
    need(task, 'Card não encontrado.');
    need(!task.client_id || clientAllowed(number, task), `O card é de ${task.company_name}, de uma cidade em que este número não age.`);
    return task;
  }

  async function designTaskFor(number, id) {
    need(isUuid(id), 'card_id inválido: use o devolvido por buscar_cards.');
    const { rows: [task] } = await pool.query(
      `SELECT t.*, c.company_name, c.city, c.is_admin_client FROM design_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`, [id]
    );
    need(task, 'Card de design não encontrado.');
    need(clientAllowed(number, task), `O card é de ${task.company_name}, de uma cidade em que este número não age.`);
    return task;
  }

  async function recordingFor(number, id) {
    need(isUuid(id), 'gravacao_id inválido: use o devolvido por agenda_gravacoes.');
    const { rows: [rec] } = await pool.query(
      `SELECT r.*, c.company_name, c.city AS client_city, c.is_admin_client, p.name AS videomaker
         FROM recordings r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN profiles p ON p.id = r.videomaker_id WHERE r.id = $1`, [id]
    );
    need(rec, 'Gravação não encontrada.');
    need(!['cancelada', 'concluida'].includes(rec.status), `Essa gravação está ${rec.status}.`);
    const city = rec.client_id ? clientCity({ city: rec.client_city, is_admin_client: rec.is_admin_client }) : (rec.city ? String(rec.city) : null);
    need(!city || (number.cities || []).includes(city), 'Essa gravação é de uma cidade em que este número não age.');
    return rec;
  }

  /** Pessoa da equipe pelo nome (tolera erro de digitação); roles filtra pela função (profiles.role ou user_roles). */
  async function personFor(name, roles = null) {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.id, p.name FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id
        WHERE p.name IS NOT NULL AND ($1::text[] IS NULL OR p.role::text = ANY($1) OR ur.role::text = ANY($1)
              OR EXISTS (SELECT 1 FROM agent_keys k WHERE k.user_id = p.id AND k.revoked_at IS NULL AND k.role = ANY($1)))`,
      [roles]
    );
    const best = rows.map((r) => ({ r, s: Math.max(nameScore(name, r.name), nameScore(name, r.name.split(/\s+/)[0])) })).sort((a, b) => b.s - a.s)[0];
    need(best && best.s >= 0.75, `Não achei "${clip(name, 40)}"${roles ? ` entre ${roles.join('/')}` : ''}.`);
    return { id: best.r.id, name: best.r.name.trim() };
  }

  async function videomakerFor(name, clientId) {
    if (name) return personFor(name, ['videomaker']);
    const { rows: [c] } = await pool.query(`SELECT c.videomaker_id, p.name FROM clients c LEFT JOIN profiles p ON p.id = c.videomaker_id WHERE c.id = $1`, [clientId]);
    need(c?.videomaker_id, 'O cliente não tem videomaker no cadastro: diga quem vai gravar.');
    return { id: c.videomaker_id, name: (c.name || 'videomaker do cliente').trim() };
  }

  const timeOf = (value) => {
    const m = String(value || '').trim().match(/^(\d{1,2})(?::|h)?(\d{2})?$/i);
    need(m, 'Hora inválida: use HH:MM.');
    const h = Number(m[1]);
    const min = Number(m[2] || 0);
    need(h >= 6 && h <= 22 && min < 60, 'Hora fora do expediente.');
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  // ── Ferramentas ──
  const TOOLS = {
    enviar_enquete: {
      permission: null,
      description: 'Manda, logo depois da sua resposta, uma enquete do WhatsApp para a pessoa escolher tocando numa opção (no lugar de botões, que o WhatsApp da agência não tem). Use quando ela precisa escolher entre caminhos: qual cliente ou card, o próximo passo, o que fazer com um vídeo. O voto volta para você como uma mensagem com o texto da opção. Uma enquete por resposta; não use para confirmar ações (o sistema já manda a enquete de sim/não).',
      input_schema: object({
        pergunta: str('Pergunta curta da enquete.'),
        opcoes: { type: 'array', items: { type: 'string' }, description: 'De 2 a 12 opções curtas e diferentes (até 100 caracteres), com o nome do que está sendo escolhido (ex.: "Aprovar: Reels Padaria 12/11").' },
      }),
      async run(number, input, turn) {
        return turn.offerPoll(input.pergunta, input.opcoes);
      },
    },

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
      description: 'Prepara o lançamento de uma despesa (sem cliente). Pedido claro lança na hora; com dúvida o sistema pede "sim" antes. Pergunte a cidade se o número pode agir nas duas e ela não disse.',
      input_schema: object({
        cidade: CITY_ONE,
        valor: { type: 'number', description: 'Valor em reais, ex.: 350.5' },
        categoria: str('Nome da categoria de despesa (ver listar_categorias_despesa).'),
        data: DATE('Data da despesa AAAA-MM-DD (null = hoje).'),
        descricao: str('Descrição curta, com as palavras da pessoa.'),
        tipo: strEnum(['fixa', 'variavel'], 'fixa (recorrente) ou variavel (pontual).'),
        clareza: CLAREZA,
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
        return turn.propose('lancar_despesa', payload, input.clareza);
      },
    },

    lancar_receita: {
      permission: 'lancar_financeiro',
      description: 'Prepara o lançamento de uma receita avulsa (com ou sem cliente). Pedido claro lança na hora; com dúvida o sistema pede "sim" antes. Com cliente, a cidade é a do cliente.',
      input_schema: object({
        cidade: nullable(CITY_ONE),
        valor: { type: 'number', description: 'Valor em reais.' },
        cliente_id: nullable(CLIENT_ID),
        vencimento: DATE('Vencimento (ou data do recebimento) AAAA-MM-DD; null = hoje.'),
        recebida: { type: 'boolean', description: 'true se o dinheiro já entrou.' },
        categoria: strEnum(Object.keys(REVENUE_CATEGORIES), 'contrato, video_unitario, edicao_videos, evento, site_sistemas ou outros.'),
        descricao: str('Descrição curta.'),
        clareza: CLAREZA,
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
        return turn.propose('lancar_receita', payload, input.clareza);
      },
    },

    criar_card_video: {
      permission: 'criar_cards',
      description: 'Prepara um card no Kanban de conteúdo/vídeo (coluna Ideias). Pedido claro cria na hora; com dúvida pede "sim".',
      input_schema: object({
        cliente_id: CLIENT_ID,
        titulo: str('Título curto do card.'),
        tipo: strEnum(Object.keys(CONTENT_TYPES), 'reels, criativo, story, arte ou otimizacao.'),
        descricao: str('O que precisa ser feito (detalhes do pedido).'),
        demanda_id: nullable(str('id da demanda detectada no grupo, se o card for para ela.')),
        clareza: CLAREZA,
      }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(CONTENT_TYPES[input.tipo], 'Tipo inválido.');
        return turn.propose('criar_card_video', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client), titulo: text(input.titulo, 120, 'Título', { required: true }),
          tipo: input.tipo, descricao: text(input.descricao, 1500, 'Descrição'), demanda_id: isUuid(input.demanda_id) ? input.demanda_id : null,
        }, input.clareza);
      },
    },

    guardar_material: {
      permission: 'criar_cards',
      description: 'Guarda no Drive do cliente o material encaminhado ao PULSE (códigos M1, M2… da mensagem "[Material encaminhado…]") e cria um card em Edição por vídeo, com o link da pasta e o roteiro. Uma pasta por vídeo final, com o título do roteiro. Sempre pede "sim".',
      input_schema: object({
        cliente_id: CLIENT_ID,
        videos: {
          type: 'array',
          description: 'Um item por vídeo final (card).',
          items: object({
            titulo: str('Título do roteiro (vira o nome da pasta no Drive e o título do card).'),
            tipo: strEnum(['reels', 'criativo', 'story'], 'reels, criativo ou story.'),
            arquivos: { type: 'array', items: { type: 'string' }, description: 'Códigos dos vídeos e fotos deste vídeo final (ex.: ["M1","M3"]).' },
            roteiro: str('Texto do roteiro deste vídeo, como veio no documento ou na mensagem (vazio se não veio).'),
          }),
        },
        clareza: CLAREZA,
      }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        const videos = Array.isArray(input.videos) ? input.videos : [];
        need(videos.length, 'Diga pelo menos um vídeo.');
        const { rows: [drive] } = await pool.query('SELECT drive_link FROM clients WHERE id = $1', [client.id]);
        need(drive?.drive_link, `O cadastro de ${client.company_name} não tem a pasta do Drive. Peça para colocarem o link da pasta do cliente no cadastro.`);
        const codes = [...new Set(videos.flatMap((v) => (v.arquivos || []).map((c) => String(c).toUpperCase().replace(/^#/, ''))))];
        const found = await materialsByCode(pool, number.id, codes);
        const missing = codes.filter((c) => !found.some((m) => m.codigo === c));
        need(!missing.length, `Não achei estes arquivos: ${missing.join(', ')}.`);
        return turn.propose('guardar_material', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client), drive_link: drive.drive_link,
          videos: videos.map((v) => ({
            titulo: text(v.titulo, 120, 'Título', { required: true }),
            tipo: ['reels', 'criativo', 'story'].includes(v.tipo) ? v.tipo : 'reels',
            arquivos: (v.arquivos || []).map((c) => String(c).toUpperCase().replace(/^#/, '')),
            roteiro: text(v.roteiro, 8000, 'Roteiro'),
          })),
        }, 'duvida');
      },
    },

    criar_card_design: {
      permission: 'criar_cards',
      description: 'Prepara um card no Kanban de design (coluna Nova tarefa) e avisa os designers. Pedido claro cria na hora; com dúvida pede "sim".',
      input_schema: object({
        cliente_id: CLIENT_ID,
        titulo: str('Título curto do card.'),
        formato: strEnum(Object.keys(DESIGN_FORMATS), 'feed, story, logomarca, midia_fisica, carrossel, capa ou thumbnail.'),
        prioridade: strEnum(Object.keys(DESIGN_PRIORITIES), 'baixa, media, alta ou urgente.'),
        prazo: DATE('Prazo AAAA-MM-DD (null = sem prazo).'),
        descricao: str('O que a arte precisa ter (detalhes, referências citadas).'),
        texto_da_arte: nullable(str('Texto que vai escrito na arte, se a pessoa disse.')),
        demanda_id: nullable(str('id da demanda detectada no grupo, se o card for para ela.')),
        clareza: CLAREZA,
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
        }, input.clareza);
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
            `SELECT id, title, content_type, kanban_column, editing_deadline, updated_at FROM content_tasks
              WHERE client_id = $1 AND kanban_column NOT IN ('arquivado', 'postado') ORDER BY updated_at DESC LIMIT 40`, [client.id]),
          pool.query(
            `SELECT id, title, format_type, kanban_column, priority, due_date FROM design_tasks
              WHERE client_id = $1 AND (kanban_column <> 'postado' OR updated_at > now() - interval '21 days')
              ORDER BY updated_at DESC LIMIT 40`, [client.id]),
          pool.query(`SELECT title, content_type, created_at FROM client_portal_contents WHERE client_id = $1 AND status = 'pendente' ORDER BY created_at DESC LIMIT 10`, [client.id]),
          pool.query(`SELECT id, date, start_time, status, type FROM recordings WHERE client_id = $1 AND date >= $2 ORDER BY date, start_time LIMIT 6`, [client.id, today]),
        ]);
        return {
          cliente: client.company_name, cidade: cityLabel(clientCity(client)),
          conteudo: content.rows.map((t) => ({ card_id: t.id, titulo: t.title, tipo: CONTENT_TYPES[t.content_type] || t.content_type, coluna: CONTENT_COLUMNS[t.kanban_column] || t.kanban_column, prazo_edicao: t.editing_deadline ? fmtDate(t.editing_deadline) : null })),
          design: design.rows.map((t) => ({ card_id: t.id, titulo: t.title, formato: DESIGN_FORMATS[t.format_type] || t.format_type, coluna: DESIGN_COLUMNS[t.kanban_column] || t.kanban_column, prioridade: t.priority, prazo: t.due_date ? fmtDate(t.due_date) : null })),
          esperando_aprovacao_no_portal: portal.rows.map((p) => ({ titulo: p.title, tipo: p.content_type, desde: fmtDate(p.created_at) })),
          proximas_gravacoes: recordings.rows.map((r) => ({ gravacao_id: r.id, data: fmtDate(r.date), hora: r.start_time, status: r.status, tipo: r.type })),
        };
      },
    },

    agenda_gravacoes: {
      permission: 'consultar_producao',
      description: 'Agenda de gravações de um período (cliente, data, hora, videomaker, status, gravacao_id para remarcar/cancelar).',
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
          `SELECT r.id, r.date, r.start_time, r.status, r.type, r.prospect_name, c.company_name, p.name AS videomaker
             FROM recordings r LEFT JOIN clients c ON c.id = r.client_id LEFT JOIN profiles p ON p.id = r.videomaker_id
            WHERE r.date BETWEEN $1::date AND $2::date AND ${cityWhere}
            ORDER BY r.date, r.start_time LIMIT 80`, params
        );
        return {
          de: fmtDate(params[0]), ate: fmtDate(params[1]), cidades: cities.map(cityLabel),
          gravacoes: rows.map((r) => ({ gravacao_id: r.id, data: fmtDate(r.date), hora: r.start_time, cliente: r.company_name || r.prospect_name || '—', videomaker: r.videomaker || null, status: r.status, tipo: r.type })),
        };
      },
    },

    pedir_relatorio_mensal: {
      permission: 'relatorios',
      description: 'Prepara o pedido do relatório mensal de um cliente para o agente do PC (tema Novembro Azul da Labovitta). Pedido claro pede na hora; com dúvida pede "sim". Quando o agente entregar, aviso quem pediu.',
      input_schema: object({ cliente_id: CLIENT_ID, mes: str('Mês do relatório AAAA-MM.'), clareza: CLAREZA }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(isMonth(input.mes), 'Mês inválido: use AAAA-MM.');
        need(input.mes <= brazilMonth() && input.mes >= '2026-03', 'Só há dados a partir de março/2026 e até o mês atual.');
        return turn.propose('pedir_relatorio', { client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mes: input.mes }, input.clareza);
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
      description: 'Prepara uma mensagem (e, se quiser, um arquivo do sistema) para o cliente: vai no grupo do cliente; cobrança vai sempre no privado. Sempre pede "sim" antes de enviar (sai para o cliente). Escreva a mensagem pronta, como a agência falaria com o cliente.',
      input_schema: object({
        cliente_id: CLIENT_ID,
        mensagem: str('Texto exato que o cliente vai receber.'),
        arquivo_url: nullable(str('Link de um arquivo do sistema (de arquivos_do_cliente).')),
        cobranca: { type: 'boolean', description: 'true se for cobrança (vai no privado do cliente).' },
        clareza: CLAREZA,
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
        }, input.clareza);
      },
    },

    enviar_relatorio_cliente: {
      permission: 'enviar_cliente',
      description: 'Prepara o envio do relatório mensal já entregue pelo agente para o WhatsApp do cliente. Sempre pede "sim" antes de enviar (sai para o cliente).',
      input_schema: object({ cliente_id: CLIENT_ID, mes: str('Mês do relatório AAAA-MM.'), clareza: CLAREZA }),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        need(isMonth(input.mes), 'Mês inválido: use AAAA-MM.');
        const { rows: [job] } = await pool.query(
          `SELECT id FROM agent_jobs WHERE type = 'relatorio_mensal' AND client_id = $1 AND params->>'month' = $2 AND status = 'entregue'
            ORDER BY delivered_at DESC LIMIT 1`, [client.id, input.mes]
        );
        need(job, `Não há relatório entregue de ${client.company_name} para ${monthLabel(input.mes)}.`);
        need(clientTarget(client, 'geral'), `${client.company_name} não tem grupo nem WhatsApp cadastrado.`);
        return turn.propose('enviar_relatorio', { job_id: job.id, client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mes: input.mes }, input.clareza);
      },
    },

    // ── Cards (busca e mudanças) ──
    buscar_cards: {
      permission: ['consultar_producao', 'editar_cards'],
      strict: false,
      description: 'Procura cards de vídeo (Kanban de conteúdo/edição) e de design pelo cliente, por palavras do título e/ou pela coluna. Devolve card_id, coluna, tipo, responsável e prazos. Use antes de mover ou editar um card.',
      input_schema: loose({
        kanban: strEnum(['conteudo', 'design', 'todos'], 'conteudo (vídeos), design (artes) ou todos.'),
        cliente_id: str('id do cliente (buscar_cliente), se a pessoa falou o cliente.'),
        texto: str('Palavras do título do card, como a pessoa falou.'),
        coluna: str('Coluna, se a pessoa falou (ex.: edicao, alteracao, revisao, ajustes, nova_tarefa).'),
      }, ['kanban']),
      async run(number, input) {
        const client = input.cliente_id ? await clientFor(number, input.cliente_id) : null;
        const q = clip(input.texto, 80);
        const kinds = input.kanban === 'todos' ? ['conteudo', 'design'] : [input.kanban];
        need(kinds.every((k) => ['conteudo', 'design'].includes(k)), 'kanban: conteudo, design ou todos.');
        need(client || q || input.coluna, 'Diga o cliente, parte do título ou a coluna do card.');
        const out = [];
        for (const kind of kinds) {
          const table = kind === 'conteudo' ? 'content_tasks' : 'design_tasks';
          const extra = kind === 'conteudo'
            ? `t.content_type AS tipo, t.editing_deadline AS prazo, t.adjustment_notes AS ajustes, ed.name AS editado_por, t.editing_priority AS prioridade_flag`
            : `t.format_type AS tipo, t.due_date AS prazo, t.priority AS prioridade, NULL::text AS ajustes, NULL::text AS editado_por`;
          const { rows } = await pool.query(
            `SELECT t.id, t.title, t.kanban_column, t.updated_at, ${extra}, c.company_name, c.city, c.is_admin_client, a.name AS responsavel
               FROM ${table} t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN profiles a ON a.id = t.assigned_to
               ${kind === 'conteudo' ? 'LEFT JOIN profiles ed ON ed.id = t.edited_by' : ''}
              WHERE ($1::uuid IS NULL OR t.client_id = $1) AND ($2::text IS NULL OR t.kanban_column = $2)
                AND t.kanban_column NOT IN ('arquivado') AND (t.kanban_column <> 'postado' OR t.updated_at > now() - interval '30 days')
              ORDER BY t.updated_at DESC LIMIT 300`,
            [client?.id || null, input.coluna ? clip(input.coluna, 40) : null]
          );
          const cols = kind === 'conteudo' ? CONTENT_COLUMNS : DESIGN_COLUMNS;
          for (const t of rows) {
            if (t.company_name && !clientAllowed(number, t)) continue;
            const score = q ? nameScore(q, t.title) : 1;
            if (q && score < 0.55) continue;
            out.push({
              score, card_id: t.id, kanban: kind, titulo: t.title, cliente: t.company_name || null, coluna: t.kanban_column, coluna_nome: cols[t.kanban_column] || t.kanban_column,
              tipo: t.tipo, responsavel: t.responsavel || null, editado_por: t.editado_por || null, prazo: t.prazo ? fmtDate(t.prazo) : null,
              prioridade: kind === 'conteudo' ? (t.prioridade_flag ? 'prioritário' : null) : t.prioridade, ultimo_ajuste: t.ajustes ? clip(t.ajustes, 200) : null,
            });
          }
        }
        out.sort((a, b) => b.score - a.score);
        const cards = out.slice(0, 20).map(({ score, ...rest }) => rest);
        return cards.length ? { cards, total_encontrado: out.length } : { cards: [], aviso: 'Nenhum card encontrado com esses dados.' };
      },
    },

    mover_card_video: {
      permission: 'editar_cards',
      strict: false,
      description: 'Move um card de vídeo no fluxo de edição: edicao (volta para a fila de edição; precisa do link dos brutos), revisao (precisa do vídeo editado) ou alteracao (pedir ajuste ao editor: informe "ajustes"). Grava igual à tela e avisa o editor. Outras colunas (Ideias, Captação, Envio…) são pela tela.',
      input_schema: loose({
        card_id: str('card_id devolvido por buscar_cards ou andamento_producao.'),
        coluna: strEnum(['edicao', 'revisao', 'alteracao'], 'Para onde vai.'),
        ajustes: str('O que mudar no vídeo (obrigatório para alteracao), com as palavras da pessoa.'),
        motivo: str('Motivo curto, se a pessoa disse.'),
        clareza: CLAREZA,
      }, ['card_id', 'coluna', 'clareza']),
      async run(number, input, turn) {
        const task = await contentTaskFor(number, input.card_id);
        need(['edicao', 'revisao', 'alteracao'].includes(input.coluna), 'Coluna: edicao, revisao ou alteracao.');
        const ajustes = input.ajustes ? text(input.ajustes, 3000, 'Ajustes') : null;
        need(input.coluna !== 'alteracao' || ajustes || task.adjustment_notes, 'Para mandar para alteração, diga o que precisa mudar.');
        need(task.kanban_column !== input.coluna || ajustes, `O card já está em ${CONTENT_COLUMNS[input.coluna]}.`);
        need(['edicao', 'pre_revisao', 'revisao', 'alteracao', 'envio'].includes(task.kanban_column), `O card está em ${CONTENT_COLUMNS[task.kanban_column] || task.kanban_column}, fora do fluxo de edição: mova pela tela.`);
        need(input.coluna !== 'revisao' || task.edited_video_link, 'O card não tem vídeo editado: não dá para mandar para revisão.');
        need(input.coluna !== 'edicao' || String(task.drive_link || '').trim(), 'O card não tem o link dos brutos: não dá para mandar para edição.');
        return turn.propose('mover_card_video', {
          task_id: task.id, titulo: task.title, client_id: task.client_id, cliente: task.company_name, de: task.kanban_column, coluna: input.coluna,
          ajustes, motivo: input.motivo ? text(input.motivo, 300, 'Motivo') : null,
        }, input.clareza);
      },
    },

    editar_card_video: {
      permission: 'editar_cards',
      strict: false,
      description: 'Muda dados de um card de vídeo: título, acrescentar à descrição, link dos brutos (Drive), prazo de edição, prioridade na edição, alteração imediata. Mande só o que muda.',
      input_schema: loose({
        card_id: str('card_id do card.'),
        titulo: str('Novo título.'),
        acrescentar_descricao: str('Texto para acrescentar à descrição.'),
        link_brutos: str('Link do Drive com os brutos.'),
        prazo_edicao: optDate('Novo prazo de edição AAAA-MM-DD.'),
        prioritario: { type: 'boolean', description: 'true = prioridade na fila de edição.' },
        alteracao_imediata: { type: 'boolean', description: 'true = alteração urgente (imediata).' },
        clareza: CLAREZA,
      }, ['card_id', 'clareza']),
      async run(number, input, turn) {
        const task = await contentTaskFor(number, input.card_id);
        const set = {};
        const changes = [];
        if (input.titulo) { set.title = text(input.titulo, 120, 'Título', { required: true }); changes.push(`título '${set.title}'`); }
        if (input.acrescentar_descricao) {
          const add = text(input.acrescentar_descricao, 1500, 'Descrição');
          set.description = [task.description, add].filter(Boolean).join('\n\n');
          changes.push(`descrição + '${clip(add, 120)}'`);
        }
        if (input.link_brutos) {
          let url;
          try { url = new URL(String(input.link_brutos).trim()); } catch { url = null; }
          need(url && /^https?:$/.test(url.protocol), 'Link dos brutos inválido.');
          set.drive_link = url.href;
          changes.push('link dos brutos');
        }
        if (input.prazo_edicao) { const d = dateOrToday(input.prazo_edicao, 'Prazo'); set.editing_deadline = `${d}T18:00:00-03:00`; changes.push(`prazo de edição ${fmtDate(d)}`); }
        if (typeof input.prioritario === 'boolean') { set.editing_priority = input.prioritario; changes.push(input.prioritario ? 'prioritário' : 'sem prioridade'); }
        if (typeof input.alteracao_imediata === 'boolean') { set.immediate_alteration = input.alteracao_imediata; changes.push(input.alteracao_imediata ? 'alteração imediata' : 'alteração normal'); }
        need(changes.length, 'Diga o que mudar no card.');
        return turn.propose('editar_card_video', { task_id: task.id, titulo: task.title, client_id: task.client_id, cliente: task.company_name, set, mudancas: changes }, input.clareza);
      },
    },

    mover_card_design: {
      permission: 'editar_cards',
      strict: false,
      description: 'Move um card de design: nova_tarefa, fila_baixa_prioridade, ajustes (pedir ajuste: informe "ajustes"), em_analise (precisa da arte anexada), enviar_cliente, aprovado ou postado. Executando é só pela tela (cronômetro da designer).',
      input_schema: loose({
        card_id: str('card_id do card de design.'),
        coluna: strEnum(['nova_tarefa', 'fila_baixa_prioridade', 'ajustes', 'em_analise', 'enviar_cliente', 'aprovado', 'postado'], 'Para onde vai.'),
        ajustes: str('O que ajustar na arte (para a coluna ajustes).'),
        clareza: CLAREZA,
      }, ['card_id', 'coluna', 'clareza']),
      async run(number, input, turn) {
        const task = await designTaskFor(number, input.card_id);
        need(DESIGN_COLUMNS[input.coluna] && !['executando', 'analise_ia'].includes(input.coluna), 'Coluna inválida.');
        const ajustes = input.ajustes ? text(input.ajustes, 2000, 'Ajustes') : null;
        need(input.coluna !== 'ajustes' || ajustes, 'Diga o que precisa ajustar na arte.');
        need(task.kanban_column !== input.coluna || ajustes, `O card já está em ${DESIGN_COLUMNS[input.coluna]}.`);
        need(input.coluna !== 'em_analise' || task.attachment_url || task.mockup_url, 'A arte não está anexada: não dá para mandar para Em análise.');
        return turn.propose('mover_card_design', {
          task_id: task.id, titulo: task.title, client_id: task.client_id, cliente: task.company_name, de: task.kanban_column, coluna: input.coluna, ajustes,
        }, input.clareza);
      },
    },

    editar_card_design: {
      permission: 'editar_cards',
      strict: false,
      description: 'Muda dados de um card de design: título, prioridade, prazo, responsável (designer), texto da arte, acrescentar à descrição. Mande só o que muda.',
      input_schema: loose({
        card_id: str('card_id do card de design.'),
        titulo: str('Novo título.'),
        prioridade: strEnum(Object.keys(DESIGN_PRIORITIES), 'baixa, media, alta ou urgente.'),
        prazo: optDate('Novo prazo AAAA-MM-DD.'),
        responsavel: str('Nome da pessoa (designer ou agente designer) que fica com o card.'),
        texto_da_arte: str('Texto que vai escrito na arte.'),
        acrescentar_descricao: str('Texto para acrescentar à descrição.'),
        clareza: CLAREZA,
      }, ['card_id', 'clareza']),
      async run(number, input, turn) {
        const task = await designTaskFor(number, input.card_id);
        const set = {};
        const changes = [];
        if (input.titulo) { set.title = text(input.titulo, 120, 'Título', { required: true }); changes.push(`título '${set.title}'`); }
        if (input.prioridade) { need(DESIGN_PRIORITIES[input.prioridade], 'Prioridade inválida.'); set.priority = input.prioridade; changes.push(`prioridade ${DESIGN_PRIORITIES[input.prioridade]}`); }
        if (input.prazo) { const d = dateOrToday(input.prazo, 'Prazo'); set.due_date = `${d}T12:00:00-03:00`; changes.push(`prazo ${fmtDate(d)}`); }
        if (input.responsavel) {
          const person = await personFor(input.responsavel, ['designer']);
          set.assigned_to = person.id;
          changes.push(`responsável ${person.name}`);
        }
        if (input.texto_da_arte) { set.copy_text = text(input.texto_da_arte, 1000, 'Texto'); changes.push('texto da arte'); }
        if (input.acrescentar_descricao) {
          const add = text(input.acrescentar_descricao, 1500, 'Descrição');
          set.description = [task.description, add].filter(Boolean).join('\n\n');
          changes.push(`descrição + '${clip(add, 120)}'`);
        }
        need(changes.length, 'Diga o que mudar no card.');
        return turn.propose('editar_card_design', { task_id: task.id, titulo: task.title, client_id: task.client_id, cliente: task.company_name, set, mudancas: changes }, input.clareza);
      },
    },

    // ── Cadastro de clientes ──
    ver_cliente: {
      permission: ['cadastro_clientes', 'consultar_producao'],
      strict: false,
      description: 'Cadastro completo de um cliente: responsável, contatos, nicho, linha editorial, links do Drive, plano e metas (reels, criativos, stories por semana, gravações por mês), dia e hora fixos de gravação, videomaker.',
      input_schema: loose({ cliente_id: CLIENT_ID }, ['cliente_id']),
      async run(number, input) {
        await clientFor(number, input.cliente_id);
        const { rows: [c] } = await pool.query(
          `SELECT c.*, p.name AS videomaker_nome, pl.name AS plano_nome FROM clients c
             LEFT JOIN profiles p ON p.id = c.videomaker_id LEFT JOIN plans pl ON pl.id = c.plan_id WHERE c.id = $1`, [input.cliente_id]
        ).catch(() => pool.query(`SELECT c.*, p.name AS videomaker_nome, NULL AS plano_nome FROM clients c LEFT JOIN profiles p ON p.id = c.videomaker_id WHERE c.id = $1`, [input.cliente_id]));
        return {
          cliente_id: c.id, nome: c.company_name, cidade: cityLabel(clientCity(c)), situacao: c.status || null, responsavel: c.responsible_person || null,
          telefone: c.phone || null, whatsapp: c.whatsapp || null, tem_grupo_whatsapp: !!String(c.whatsapp_group || '').trim(), email: c.email || null,
          nicho: c.niche || null, linha_editorial: c.editorial ? clip(c.editorial, 600) : null, plano: c.plano_nome || null,
          metas: { reels_semana: Number(c.weekly_reels) || 0, criativos_semana: Number(c.weekly_creatives) || 0, stories_semana: Number(c.weekly_stories) || 0, gravacoes_mes: c.monthly_recordings },
          gravacao_fixa: { dia: c.fixed_day, hora: c.fixed_time }, videomaker: c.videomaker_nome || null,
          drive: { brutos: c.drive_link || null, fotos: c.drive_fotos || null, identidade_visual: c.drive_identidade_visual || null },
          inicio_contrato: c.contract_start_date ? fmtDate(c.contract_start_date) : null,
        };
      },
    },

    atualizar_cliente: {
      permission: 'cadastro_clientes',
      strict: false,
      description: 'Atualiza o cadastro de um cliente. Mande só os campos que mudam. Dia/hora fixos de gravação, plano, contrato, cidade e cancelamento são pela tela de Clientes (mexem na agenda e no financeiro).',
      input_schema: loose({
        cliente_id: CLIENT_ID,
        nome: str('Novo nome da empresa.'),
        responsavel: str('Nome do responsável.'),
        telefone: str('Telefone.'),
        whatsapp: str('WhatsApp do cliente (com DDD).'),
        email: str('E-mail.'),
        nicho: str('Nicho/segmento.'),
        linha_editorial: str('Linha editorial (substitui a atual).'),
        link_drive: str('Link do Drive dos brutos.'),
        link_drive_fotos: str('Link do Drive das fotos.'),
        link_identidade_visual: str('Link da identidade visual.'),
        reels_semana: { type: 'number', description: 'Meta de reels por semana.' },
        criativos_semana: { type: 'number', description: 'Meta de criativos por semana.' },
        stories_semana: { type: 'number', description: 'Meta de stories por semana.' },
        gravacoes_mes: { type: 'integer', description: 'Gravações por mês.' },
        clareza: CLAREZA,
      }, ['cliente_id', 'clareza']),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        const set = {};
        const changes = [];
        const textField = (key, column, label, max) => {
          if (input[key] == null || input[key] === '') return;
          set[column] = text(input[key], max, label, { required: true });
          changes.push(`${label} '${clip(set[column], 80)}'`);
        };
        textField('nome', 'company_name', 'nome', 120);
        textField('responsavel', 'responsible_person', 'responsável', 120);
        textField('email', 'email', 'e-mail', 160);
        textField('nicho', 'niche', 'nicho', 120);
        textField('linha_editorial', 'editorial', 'linha editorial', 4000);
        for (const [key, column, label] of [['telefone', 'phone', 'telefone'], ['whatsapp', 'whatsapp', 'WhatsApp']]) {
          if (!input[key]) continue;
          const d = String(input[key]).replace(/\D/g, '');
          need(d.length >= 10 && d.length <= 13, `${label} inválido: mande com DDD.`);
          set[column] = d;
          changes.push(`${label} ${d}`);
        }
        for (const [key, column, label] of [['link_drive', 'drive_link', 'Drive dos brutos'], ['link_drive_fotos', 'drive_fotos', 'Drive das fotos'], ['link_identidade_visual', 'drive_identidade_visual', 'identidade visual']]) {
          if (!input[key]) continue;
          let url;
          try { url = new URL(String(input[key]).trim()); } catch { url = null; }
          need(url && /^https?:$/.test(url.protocol), `Link inválido (${label}).`);
          set[column] = url.href;
          changes.push(label);
        }
        for (const [key, column, label, max] of [['reels_semana', 'weekly_reels', 'reels/semana', 30], ['criativos_semana', 'weekly_creatives', 'criativos/semana', 30], ['stories_semana', 'weekly_stories', 'stories/semana', 60], ['gravacoes_mes', 'monthly_recordings', 'gravações/mês', 31]]) {
          if (input[key] == null) continue;
          const n = Number(input[key]);
          need(Number.isFinite(n) && n >= 0 && n <= max, `${label} inválido.`);
          set[column] = key === 'gravacoes_mes' ? Math.round(n) : n;
          changes.push(`${label} ${n}`);
        }
        if (set.company_name) {
          const { rows: [dup] } = await pool.query(`SELECT 1 FROM clients WHERE lower(btrim(company_name)) = lower(btrim($1)) AND id <> $2 LIMIT 1`, [set.company_name, client.id]);
          need(!dup, `Já existe outro cliente chamado "${set.company_name}".`);
        }
        need(changes.length, 'Diga o que mudar no cadastro.');
        return turn.propose('atualizar_cliente', { client_id: client.id, cliente: client.company_name, cidade: clientCity(client), set, mudancas: changes }, input.clareza);
      },
    },

    cadastrar_cliente: {
      permission: 'cadastro_clientes',
      strict: false,
      description: 'Pré-cadastra um cliente novo (nome, cidade, responsável, WhatsApp, e-mail, nicho). Plano, contrato, dia de gravação e metas são completados na tela de Clientes. Confira com buscar_cliente se ele já existe.',
      input_schema: loose({
        nome: str('Nome da empresa.'),
        cidade: CITY_ONE,
        responsavel: str('Nome do responsável.'),
        whatsapp: str('WhatsApp com DDD.'),
        email: str('E-mail.'),
        nicho: str('Nicho/segmento.'),
        clareza: CLAREZA,
      }, ['nome', 'cidade', 'clareza']),
      async run(number, input, turn) {
        const [cidade] = citiesFor(number, input.cidade);
        const nome = text(input.nome, 120, 'Nome', { required: true });
        const { rows } = await pool.query(`SELECT company_name FROM clients`);
        const twin = rows.find((r) => nameScore(nome, r.company_name) >= 0.9);
        need(!twin, `Já existe um cliente parecido: "${twin?.company_name}". Use esse ou confirme outro nome.`);
        let whatsapp = null;
        if (input.whatsapp) {
          whatsapp = String(input.whatsapp).replace(/\D/g, '');
          need(whatsapp.length >= 10 && whatsapp.length <= 13, 'WhatsApp inválido: mande com DDD.');
        }
        return turn.propose('cadastrar_cliente', {
          nome, cidade, responsavel: input.responsavel ? text(input.responsavel, 120, 'Responsável') : null, whatsapp,
          email: input.email ? text(input.email, 160, 'E-mail') : null, nicho: input.nicho ? text(input.nicho, 120, 'Nicho') : null,
        }, input.clareza);
      },
    },

    // ── Agenda de gravações ──
    marcar_gravacao: {
      permission: 'agenda',
      strict: false,
      description: 'Marca uma gravação para um cliente (confere se o cliente já tem gravação no dia e se o videomaker está livre). Sem videomaker dito, usa o do cadastro do cliente.',
      input_schema: loose({
        cliente_id: CLIENT_ID,
        data: optDate('Data AAAA-MM-DD.'),
        hora: str('Hora HH:MM (24 h).'),
        videomaker: str('Nome do videomaker, se a pessoa disse.'),
        tipo: strEnum(Object.keys(RECORDING_TYPES), 'fixa, extra ou avulso (padrão extra quando é uma gravação a mais no mês).'),
        clareza: CLAREZA,
      }, ['cliente_id', 'data', 'hora', 'tipo', 'clareza']),
      async run(number, input, turn) {
        const client = await clientFor(number, input.cliente_id);
        const data = dateOrToday(input.data, 'Data');
        need(data >= brazilToday(), 'A data já passou.');
        const hora = timeOf(input.hora);
        need(RECORDING_TYPES[input.tipo], 'Tipo: fixa, extra ou avulso.');
        const vm = await videomakerFor(input.videomaker, client.id);
        const conflict = await recordingConflict(pool, { client_id: client.id, videomaker_id: vm.id, data, hora });
        need(!conflict, conflict);
        return turn.propose('marcar_gravacao', {
          client_id: client.id, cliente: client.company_name, cidade: clientCity(client) || (number.cities || [])[0], data, hora, tipo: input.tipo,
          videomaker_id: vm.id, videomaker: vm.name,
        }, input.clareza);
      },
    },

    remarcar_gravacao: {
      permission: 'agenda',
      strict: false,
      description: 'Remarca uma gravação agendada (gravacao_id de agenda_gravacoes ou andamento_producao) para outra data/hora e, se a pessoa disser, outro videomaker.',
      input_schema: loose({
        gravacao_id: str('gravacao_id.'),
        data: optDate('Nova data AAAA-MM-DD.'),
        hora: str('Nova hora HH:MM.'),
        videomaker: str('Novo videomaker, se mudar.'),
        clareza: CLAREZA,
      }, ['gravacao_id', 'data', 'hora', 'clareza']),
      async run(number, input, turn) {
        const rec = await recordingFor(number, input.gravacao_id);
        const data = dateOrToday(input.data, 'Data');
        need(data >= brazilToday(), 'A nova data já passou.');
        const hora = timeOf(input.hora);
        const vm = input.videomaker ? await videomakerFor(input.videomaker, rec.client_id) : { id: rec.videomaker_id, name: rec.videomaker };
        const conflict = await recordingConflict(pool, { client_id: rec.client_id, videomaker_id: vm.id, data, hora, excludeId: rec.id });
        need(!conflict, conflict);
        return turn.propose('remarcar_gravacao', {
          recording_id: rec.id, client_id: rec.client_id, cliente: rec.company_name || rec.prospect_name, de_data: String(rec.date).slice(0, 10), de_hora: rec.start_time,
          data, hora, videomaker_id: vm.id, videomaker: vm.name, videomaker_mudou: vm.id !== rec.videomaker_id,
        }, input.clareza);
      },
    },

    cancelar_gravacao: {
      permission: 'agenda',
      strict: false,
      description: 'Cancela uma gravação agendada (gravacao_id).',
      input_schema: loose({ gravacao_id: str('gravacao_id.'), clareza: CLAREZA }, ['gravacao_id', 'clareza']),
      async run(number, input, turn) {
        const rec = await recordingFor(number, input.gravacao_id);
        return turn.propose('cancelar_gravacao', {
          recording_id: rec.id, client_id: rec.client_id, cliente: rec.company_name || rec.prospect_name, data: String(rec.date).slice(0, 10), hora: rec.start_time, videomaker: rec.videomaker,
        }, input.clareza);
      },
    },

    // ── Agentes de IA (Marcely, Uriel, editores, designers) ──
    ver_agentes: {
      permission: ['comandar_agentes', 'consultar_producao'],
      strict: false,
      description: 'Os agentes de IA conectados: nome, função (chefe, revisor, editor, designer, revisor de arte), se está trabalhando agora e em quê, se está pausado, e a fila de edição/design.',
      input_schema: loose({}),
      async run() {
        const [agents, pauses, editing, design, queue] = await Promise.all([
          pool.query(
            `SELECT DISTINCT ON (k.user_id) k.user_id, k.role, k.last_used_at, p.name, a.status, a.updated_at AS status_at
               FROM agent_keys k JOIN profiles p ON p.id = k.user_id LEFT JOIN agent_activity a ON a.user_id = k.user_id
              WHERE k.revoked_at IS NULL ORDER BY k.user_id, k.last_used_at DESC NULLS LAST`),
          pool.query(`SELECT scope, reason FROM agent_pauses`).catch(() => ({ rows: [] })),
          pool.query(
            `SELECT t.assigned_to, t.title, t.kanban_column, t.agent_step, c.company_name FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
              WHERE t.agent_heartbeat_at > now() - interval '30 minutes'`).catch(() => ({ rows: [] })),
          pool.query(
            `SELECT t.assigned_to, t.title, t.kanban_column, t.agent_step, c.company_name FROM design_tasks t LEFT JOIN clients c ON c.id = t.client_id
              WHERE t.agent_heartbeat_at > now() - interval '30 minutes'`).catch(() => ({ rows: [] })),
          pool.query(`SELECT kanban_column, count(*)::int AS n FROM content_tasks WHERE kanban_column IN ('edicao', 'alteracao', 'pre_revisao', 'revisao') GROUP BY 1`),
        ]);
        const all = pauses.rows.find((p) => p.scope === 'all');
        const ROLE = { chefe: 'chefe (coordena, libera da Pré-revisão, move e distribui cards)', revisor: 'revisor de vídeo (Pré-revisão)', editor: 'editor de vídeo', designer: 'designer (artes)', revisor_arte: 'revisor de artes' };
        return {
          todos_pausados: all ? { motivo: all.reason || null } : null,
          agentes: agents.rows.map((a) => {
            const own = pauses.rows.find((p) => p.scope === a.user_id);
            const card = [...editing.rows, ...design.rows].find((t) => t.assigned_to === a.user_id);
            const online = a.status_at && Date.now() - new Date(a.status_at).getTime() < 15 * 60_000;
            return {
              nome: a.name.trim(), funcao: ROLE[a.role] || a.role, pausado: !!(all || own), trabalhando_agora: !!(card || online),
              status: online ? a.status : null, card_atual: card ? `${card.title} (${card.company_name || 'sem cliente'}) · ${card.agent_step || card.kanban_column}` : null,
              ultimo_sinal: a.last_used_at ? fmtDate(a.last_used_at) : null,
            };
          }),
          fila_edicao: Object.fromEntries(queue.rows.map((r) => [CONTENT_COLUMNS[r.kanban_column] || r.kanban_column, r.n])),
        };
      },
    },

    mandar_recado_agente: {
      permission: 'comandar_agentes',
      strict: false,
      description: 'Manda uma ordem ou recado para um ou mais agentes de IA (ex.: Marcely, a chefe) ou para "todos". O agente lê na caixa de recados e executa (a Marcely move, distribui e cobra os cards; os editores editam). Escreva a ordem completa e objetiva, com cliente, card e o que fazer.',
      input_schema: loose({
        agentes: { type: 'array', items: { type: 'string' }, description: 'Nomes dos agentes (ex.: ["Marcely"]) ou ["todos"].' },
        recado: str('A ordem/recado, completo.'),
        clareza: CLAREZA,
      }, ['agentes', 'recado', 'clareza']),
      async run(number, input, turn) {
        const names = (Array.isArray(input.agentes) ? input.agentes : [input.agentes]).map((n) => clip(n, 60)).filter(Boolean);
        need(names.length, 'Diga para qual agente.');
        const recado = text(input.recado, 3500, 'Recado', { required: true });
        const { rows } = await pool.query(
          `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id WHERE k.revoked_at IS NULL`
        );
        need(rows.length, 'Nenhum agente conectado agora.');
        let targets;
        if (names.some((n) => norm(n) === 'todos')) targets = rows;
        else {
          targets = [];
          for (const n of names) {
            const best = rows.map((r) => ({ r, s: Math.max(nameScore(n, r.name), nameScore(n, r.name.split(/\s+/)[0])) })).sort((a, b) => b.s - a.s)[0];
            need(best && best.s >= 0.75, `Não achei o agente "${n}". Agentes: ${rows.map((r) => r.name.trim()).join(', ')}.`);
            if (!targets.includes(best.r)) targets.push(best.r);
          }
        }
        return turn.propose('recado_agente', { agente_ids: targets.map((t) => t.user_id), agentes: targets.map((t) => t.name.trim()), recado }, input.clareza);
      },
    },

    // Caixa da Marcely no WhatsApp (marcelyInbox.mjs): o pedido vai inteiro para ela, que responde por este número
    passar_para_marcely: {
      permission: 'marcely',
      strict: false,
      description: 'Passa a mensagem para a Marcely, a chefe dos agentes, que responde por este mesmo WhatsApp. Use quando não é um comando simples que as outras ferramentas resolvem na hora: demanda ou ideia para a operação, pergunta sobre como estão os vídeos/agentes/clientes que pede análise ("como está o G4?"), pedido que precisa de agente (editar, refazer, priorizar, organizar a fila), conversa com a Marcely ou resposta a uma mensagem dela (as dela terminam com "— Marcely"). A mensagem original vai junto sozinha; escreva no resumo o que a pessoa quer, com cliente, card e prazo se ela disse. Uma vez por mensagem.',
      input_schema: loose({
        tipo: strEnum(['pedido', 'pergunta', 'resposta'], 'pedido (fazer algo), pergunta (quer saber algo) ou resposta (responde a uma mensagem da Marcely).'),
        resumo: str('O que a pessoa quer, em uma ou duas frases, com os nomes certos (cliente, card, agente, prazo).'),
      }, ['tipo', 'resumo']),
      async run(number, input, turn) {
        need(!turn.marcely, 'Já passei esta mensagem para a Marcely.');
        const item = await addInboxItem(pool, {
          origem: 'equipe', kind: ['pedido', 'pergunta', 'resposta'].includes(input.tipo) ? input.tipo : 'pedido',
          numberId: number.id, fromName: number.user_name || number.name,
          texto: turn.sourceText || input.resumo, resumo: text(input.resumo, 1200, 'Resumo'), inboundId: turn.inboundId || null,
        });
        turn.marcely = item.id;
        turn.done.push({ kind: 'marcely', summary: 'Passado para a Marcely', ok: true, message: MARCELY_RECEIVED });
        return { status: 'feito', mensagem: MARCELY_RECEIVED, instrucao: `Responda só: "${MARCELY_RECEIVED}" (e o que você mesmo fez nesta mensagem, se fez algo). Não responda pela Marcely nem diga o que ela vai fazer.` };
      },
    },

    pausar_retomar_agentes: {
      permission: 'comandar_agentes',
      strict: false,
      description: 'Pausa (não pegam card novo) ou retoma um agente ou todos.',
      input_schema: loose({
        pausar: { type: 'boolean', description: 'true = pausar; false = retomar.' },
        agente: str('Nome do agente; omita para todos.'),
        motivo: str('Motivo, se a pessoa disse.'),
        clareza: CLAREZA,
      }, ['pausar', 'clareza']),
      async run(number, input, turn) {
        let scope = 'all';
        let agente = null;
        if (input.agente && norm(input.agente) !== 'todos') {
          const { rows } = await pool.query(`SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id WHERE k.revoked_at IS NULL`);
          const best = rows.map((r) => ({ r, s: Math.max(nameScore(input.agente, r.name), nameScore(input.agente, r.name.split(/\s+/)[0])) })).sort((a, b) => b.s - a.s)[0];
          need(best && best.s >= 0.75, `Não achei o agente "${clip(input.agente, 40)}".`);
          scope = best.r.user_id;
          agente = best.r.name.trim();
        }
        return turn.propose('pausar_agentes', { scope, agente, pausar: !!input.pausar, motivo: input.motivo ? text(input.motivo, 300, 'Motivo') : null }, input.clareza);
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
      .map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema, ...(t.strict === false ? {} : { strict: true }) }));
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
 * Estado de uma mensagem. Ação com pedido claro roda na hora (execute, do motor) e o resultado volta ao modelo;
 * com dúvida — ou o que sai para o cliente (ALWAYS_CONFIRM) — fica na lista de propostas, que o motor grava depois
 * que o laço termina bem (sem confirmação órfã se a IA falhar no meio) e manda num resumo só pedindo "sim".
 */
export function createTurn({ execute = null, sourceText = null, inboundId = null } = {}) {
  const turn = {
    sourceText, // a mensagem como a pessoa mandou (passar_para_marcely guarda ela, não a paráfrase do modelo)
    inboundId,
    marcely: null,
    proposals: [],
    done: [],
    poll: null,
    get proposal() { return turn.proposals[0] || null; },
    offerPoll(pergunta, opcoes) {
      need(!turn.poll, 'Já tem uma enquete nesta resposta.');
      let poll;
      try {
        poll = normalizePoll({ name: pergunta, options: Array.isArray(opcoes) ? opcoes : [] });
      } catch (error) {
        throw new UseError(error.message);
      }
      turn.poll = poll;
      return { status: 'enquete_preparada', instrucao: 'A enquete sai logo depois da sua resposta. Escreva só uma frase curta antes dela; não liste as opções de novo no texto.' };
    },
    async propose(kind, payload, clareza = 'duvida') {
      const summary = SUMMARIES[kind](payload);
      if (turn.proposals.length >= 8) throw new UseError('Ações demais numa mensagem: peça o resto em seguida.');
      if (execute && clareza === 'clara' && !ALWAYS_CONFIRM.has(kind)) {
        const outcome = await execute(kind, payload);
        turn.done.push({ kind, summary, ...outcome });
        return outcome.ok
          ? { status: 'feito', mensagem: outcome.message, ...(outcome.result ? { resultado: outcome.result } : {}) }
          : { status: 'nao_feito', erro: outcome.message, instrucao: 'Diga à pessoa o motivo, em uma frase.' };
      }
      turn.proposals.push({ kind, payload, summary });
      return {
        status: 'aguardando_confirmacao',
        resumo: summary,
        instrucao: 'O sistema manda o resumo à pessoa pedindo sim/não. Não diga que já foi feito e não repita o resumo.',
      };
    },
  };
  return turn;
}

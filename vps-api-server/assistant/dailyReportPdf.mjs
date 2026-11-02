// Assistente PULSE — resumo do dia em PDF (pedido do usuário, 01/11/2026: "em vez de enviar o relatório diário das 6
// horas em texto, eu quero um PDF, com a foto de todo mundo, o que cada um fez durante o dia, quais foram as entregas,
// com ícones, bonitinho, tudo bem organizado, que eu bato o olho e sei o que aconteceu. Até as movimentações
// financeiras").
//
// collectDayPdf(pool, cities, { financeiro }) busca tudo no banco (sem o Claude) e dailyPdfSpec monta o documento do
// gerador da Ísis (lib/billingPdf.mjs, mesmo modelo grafite/laranja/DM Sans):
//   1. números do dia em quadros com ícone (vídeos, artes, posts, gravações, cards movidos, e entradas/saídas do caixa)
//   2. por pessoa (equipe e agentes, só quem teve atividade): foto redonda, nome, função e o que fez, com ícone por tipo
//   3. entregas do dia por cliente: entregue, aprovado, postado e o que entrou em alteração
//   4. financeiro (só para quem tem "consultar_financeiro"): todas as movimentações do caixa no dia, com cliente ou
//      descrição, forma (InfinitePay, baixa manual, saída), valor e quem lançou; cobranças enviadas; totais e saldo
//   5. pendências para amanhã: atrasados, urgentes, aguardando material e agentes parados
// Cada consulta falha sozinha (log e lista vazia): uma tabela que não existe não derruba o resumo.

import { cityLabel, clip, fmtMoney, roundMoney } from './common.mjs';

const TZ = 'America/Sao_Paulo';
const TODAY_OF = (col) => `(${col} AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`;
const BR_TODAY = `(now() AT TIME ZONE '${TZ}')::date`;

const AGENT_ROLE = {
  chefe: 'Chefe dos agentes', revisor: 'Revisão de vídeo (IA)', editor: 'Edição de vídeo (IA)', designer: 'Design (IA)',
  revisor_arte: 'Revisão de arte (IA)', social_media: 'Social media (IA)', colorista: 'Cor (IA)', som: 'Som (IA)',
  roteirista: 'Roteiro (IA)', triagem: 'Triagem de brutos (IA)',
};
const TEAM_ROLE = {
  admin: 'Administração', editor: 'Edição de vídeo', videomaker: 'Videomaker', social_media: 'Social media', designer: 'Design',
  fotografo: 'Fotografia', financeiro: 'Financeiro', parceiro: 'Parceiro', endomarketing: 'Endomarketing',
};

/** Texto para o PDF: sem emoji nem símbolo que a DM Sans não desenha (viraria um quadrado). */
const pdfText = (value, max) => clip(String(value ?? '')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  .replace(/\s+/g, ' '), max);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const names = (list, max = 3) => {
  const uniq = [...new Set((list || []).map((s) => pdfText(s, 40)).filter(Boolean))];
  if (!uniq.length) return '';
  return ` — ${uniq.slice(0, max).join(', ')}${uniq.length > max ? ` e mais ${uniq.length - max}` : ''}`;
};

/** Foto do perfil para o PDF: só PNG/JPEG (o pdfkit não lê WEBP), até 3 MB e 4 s; senão, a inicial. */
async function fetchPhoto(url, { publicUploadsUrl } = {}) {
  let u = String(url || '').trim();
  if (!u) return null;
  if (u.startsWith('/')) u = `${String(publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/uploads\/?$/, '')}${u}`;
  if (!/^https?:\/\//i.test(u)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(u, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) return null;
    const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    return png || jpg ? buf : null;
  } catch {
    return null;
  }
}

/** Tudo do dia nas cidades dadas (null/[] = todas). Financeiro só com { financeiro: true }. */
export async function collectDayPdf(pool, cities, { financeiro = false, publicUploadsUrl, photos = true } = {}) {
  const params = cities?.length ? [cities] : [];
  const cityOf = (alias) => (cities?.length ? `AND ${alias}city = ANY($1::text[])` : '');
  const q = (sql, extra = params) => pool.query(sql, extra).then((r) => r.rows).catch((error) => {
    console.error('[resumo do dia · pdf]', error.message);
    return [];
  });
  const NAME = `coalesce(nullif(p.display_name, ''), p.name)`;

  const [
    hist, design, entregues, gravacoes, posts, agentes, agentCards, entregasCli, aprovCli, altCli, artesCli, postCli,
    atrasados, parados, filaRows,
  ] = await Promise.all([
    // histórico dos cards de vídeo, por pessoa e ação, com os clientes
    q(`SELECT h.user_id, ${NAME} AS nome, p.role::text AS role, p.job_title, p.avatar_url, h.action, count(*)::int AS n,
              array_agg(DISTINCT c.company_name) FILTER (WHERE c.company_name IS NOT NULL) AS clientes
         FROM task_history h JOIN profiles p ON p.id = h.user_id
         LEFT JOIN content_tasks t ON t.id = h.task_id LEFT JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} ${cityOf('h.')} GROUP BY 1, 2, 3, 4, 5, 6`),
    q(`SELECT h.user_id, ${NAME} AS nome, p.role::text AS role, p.job_title, p.avatar_url, h.action, count(*)::int AS n,
              array_agg(DISTINCT c.company_name) FILTER (WHERE c.company_name IS NOT NULL) AS clientes
         FROM design_task_history h JOIN profiles p ON p.id = h.user_id
         LEFT JOIN design_tasks t ON t.id = h.task_id LEFT JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} ${cityOf('h.')} GROUP BY 1, 2, 3, 4, 5, 6`),
    q(`SELECT v.created_by AS user_id, ${NAME} AS nome, p.role::text AS role, p.job_title, p.avatar_url,
              count(DISTINCT v.task_id)::int AS n, array_agg(DISTINCT c.company_name) FILTER (WHERE c.company_name IS NOT NULL) AS clientes
         FROM edit_versions v JOIN content_tasks t ON t.id = v.task_id JOIN profiles p ON p.id = v.created_by
         LEFT JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('v.created_at')} ${cityOf('t.')} GROUP BY 1, 2, 3, 4, 5`),
    q(`SELECT r.videomaker_id AS user_id, ${NAME} AS nome, p.role::text AS role, p.job_title, p.avatar_url, count(*)::int AS n,
              array_agg(DISTINCT coalesce(c.company_name, r.prospect_name)) AS clientes
         FROM recordings r JOIN profiles p ON p.id = r.videomaker_id LEFT JOIN clients c ON c.id = r.client_id
        WHERE r.date = ${BR_TODAY} AND coalesce(r.status, '') !~* 'cancel' ${cityOf('r.')} GROUP BY 1, 2, 3, 4, 5`),
    // posts publicados hoje (automático pelo Estúdio ou marcado como postado na mão)
    q(`SELECT s.created_by AS user_id, ${NAME} AS nome, p.role::text AS role, p.job_title, p.avatar_url, count(*)::int AS n,
              array_agg(DISTINCT c.company_name) FILTER (WHERE c.company_name IS NOT NULL) AS clientes
         FROM (SELECT created_by, client_id FROM scheduled_posts WHERE status = 'publicado' AND ${TODAY_OF('coalesce(published_at, scheduled_at)')}
               UNION ALL
               SELECT created_by, client_id FROM social_media_deliveries WHERE status = 'postado' AND posted_at::date = ${BR_TODAY}) s
         LEFT JOIN profiles p ON p.id = s.created_by LEFT JOIN clients c ON c.id = s.client_id
        GROUP BY 1, 2, 3, 4, 5`, []),
    // agentes: quem tem chave, o último status de hoje
    q(`SELECT DISTINCT ON (k.user_id) k.user_id, k.role, ${NAME} AS nome, p.avatar_url, a.status, a.updated_at
         FROM agent_keys k JOIN profiles p ON p.id = k.user_id LEFT JOIN agent_activity a ON a.user_id = k.user_id
        WHERE k.revoked_at IS NULL ORDER BY k.user_id, k.created_at DESC`, []),
    // cards em que um agente trabalhou hoje (etapa ao vivo)
    q(`SELECT t.assigned_to AS user_id, t.title, t.agent_step, c.company_name AS cliente, 'video' AS tipo
         FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.agent_heartbeat_at IS NOT NULL AND ${TODAY_OF('t.agent_heartbeat_at')} ${cityOf('t.')}
       UNION ALL
       SELECT t.assigned_to, t.title, t.agent_step, c.company_name, 'arte'
         FROM design_tasks t LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.agent_heartbeat_at IS NOT NULL AND ${TODAY_OF('t.agent_heartbeat_at')} ${cityOf('t.')}`),
    // por cliente: entregue (versão nova), aprovado, alteração pedida, artes, postado
    q(`SELECT c.company_name AS cliente, t.title FROM edit_versions v JOIN content_tasks t ON t.id = v.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('v.created_at')} ${cityOf('t.')} GROUP BY 1, 2`),
    q(`SELECT c.company_name AS cliente, t.title FROM task_history h JOIN content_tasks t ON t.id = h.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} AND h.action ~ '^✅ Aprovado' ${cityOf('h.')} GROUP BY 1, 2
       UNION
       SELECT c.company_name, t.title FROM design_task_history h JOIN design_tasks t ON t.id = h.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} AND h.action ~* '^Aprovad' ${cityOf('h.')} GROUP BY 1, 2`),
    q(`SELECT c.company_name AS cliente, t.title FROM task_history h JOIN content_tasks t ON t.id = h.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} AND h.action = 'Solicitado Alteração' ${cityOf('h.')} GROUP BY 1, 2`),
    q(`SELECT c.company_name AS cliente, t.title FROM design_task_history h JOIN design_tasks t ON t.id = h.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_OF('h.created_at')} AND h.action ~* '^Arte (enviada|entregue|corrigida)' ${cityOf('h.')} GROUP BY 1, 2`),
    q(`SELECT c.company_name AS cliente, coalesce(s.caption, s.title, '') AS title
         FROM (SELECT client_id, left(caption, 60) AS caption, NULL::text AS title FROM scheduled_posts
                WHERE status = 'publicado' AND ${TODAY_OF('coalesce(published_at, scheduled_at)')}
               UNION ALL
               SELECT client_id, NULL, title FROM social_media_deliveries WHERE status = 'postado' AND posted_at::date = ${BR_TODAY}) s
         JOIN clients c ON c.id = s.client_id ${cities?.length ? 'WHERE c.city = ANY($1::text[])' : ''}`),
    // pendências: prazo vencido nas colunas da edição
    q(`SELECT t.title, c.company_name AS cliente, t.kanban_column AS col, coalesce(t.alteration_deadline, t.editing_deadline) AS prazo
         FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
        WHERE t.kanban_column IN ('edicao', 'alteracao') AND coalesce(t.alteration_deadline, t.editing_deadline) < now() ${cityOf('t.')}
        ORDER BY 4 LIMIT 8`),
    q(`SELECT t.title, c.company_name AS cliente, ${NAME} AS agente, t.agent_step, t.agent_heartbeat_at
         FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN profiles p ON p.id = t.assigned_to
        WHERE t.kanban_column IN ('edicao', 'alteracao') AND t.agent_heartbeat_at < now() - interval '30 minutes'
          AND t.agent_heartbeat_at > now() - interval '3 days' AND t.assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)
          ${cityOf('t.')} ORDER BY t.agent_heartbeat_at LIMIT 6`),
    q(`SELECT kanban_column AS col, count(*)::int AS n,
              count(*) FILTER (WHERE urgent_at IS NOT NULL)::int AS urgentes,
              count(*) FILTER (WHERE waiting_material_at IS NOT NULL)::int AS aguardando
         FROM content_tasks WHERE kanban_column IN ('edicao', 'alteracao', 'pre_revisao', 'revisao') ${cityOf('')} GROUP BY 1`),
  ]);

  // ── pessoas ──
  const agentById = new Map(agentes.map((a) => [a.user_id, a]));
  const people = new Map();
  const person = (row) => {
    if (!row?.user_id) return null;
    if (!people.has(row.user_id)) {
      const ag = agentById.get(row.user_id);
      people.set(row.user_id, {
        id: row.user_id, name: pdfText(row.nome || ag?.nome || 'Sem nome', 40), agent: !!ag, avatar: row.avatar_url || ag?.avatar_url || null,
        role: ag ? (AGENT_ROLE[ag.role] || 'Agente de IA') : (clip(row.job_title, 50) || TEAM_ROLE[row.role] || ''),
        items: [], weight: 0,
      });
    }
    return people.get(row.user_id);
  };
  const add = (p, icon, n, text, clientes) => {
    if (!p || !(n > 0)) return;
    p.items.push({ icon, text: `${text}${names(clientes)}` });
    p.weight += n;
  };
  for (const r of gravacoes) add(person(r), 'gravacao', r.n, plural(r.n, 'gravação feita', 'gravações feitas'), r.clientes);
  for (const r of entregues) add(person(r), 'edicao', r.n, plural(r.n, 'vídeo entregue', 'vídeos entregues'), r.clientes);
  for (const r of posts) add(person(r), 'post', r.n, plural(r.n, 'post publicado', 'posts publicados'), r.clientes);
  const HIST = [
    [/^Alteração iniciada$/, 'alteracao', 'alteração feita', 'alterações feitas'],
    [/^Parecer da Análise$/, 'aprovacao', 'parecer na Análise', 'pareceres na Análise'],
    [/^Enviado para revis/i, 'aprovacao', 'vídeo liberado para a revisão', 'vídeos liberados para a revisão'],
    [/^✅ Aprovado/, 'aprovacao', 'aprovação', 'aprovações'],
    [/^Enviado para Cliente$/, 'atendimento', 'vídeo enviado ao cliente', 'vídeos enviados ao cliente'],
    [/^Solicitado Alteração$/, 'atendimento', 'alteração pedida', 'alterações pedidas'],
  ];
  const DESIGN = [
    [/^Arte (enviada|entregue|corrigida)/i, 'arte', 'arte entregue', 'artes entregues'],
    [/^(Aprovad|Ajustes solicitados)/i, 'aprovacao', 'arte conferida', 'artes conferidas'],
  ];
  const fold = (rows, rules) => {
    const acc = new Map(); // user|regra → { n, clientes }
    for (const r of rows) {
      const i = rules.findIndex(([re]) => re.test(r.action));
      if (i < 0) continue;
      const key = `${r.user_id}|${i}`;
      const cur = acc.get(key) || { row: r, rule: rules[i], n: 0, clientes: [] };
      cur.n += r.n;
      cur.clientes.push(...(r.clientes || []));
      acc.set(key, cur);
    }
    for (const { row, rule, n, clientes } of acc.values()) add(person(row), rule[1], n, plural(n, rule[2], rule[3]), clientes);
  };
  fold(hist, HIST);
  fold(design, DESIGN);
  // cards movidos: todo registro do histórico dos cards (vídeo e arte) no dia, de cada pessoa
  const movedBy = new Map();
  for (const r of [...hist, ...design]) movedBy.set(r.user_id, (movedBy.get(r.user_id) || 0) + r.n);
  // agentes: os cards em que trabalharam e o último status, mesmo sem entrega
  const cardsByAgent = new Map();
  for (const c of agentCards) {
    if (!agentById.has(c.user_id)) continue;
    if (!cardsByAgent.has(c.user_id)) cardsByAgent.set(c.user_id, []);
    cardsByAgent.get(c.user_id).push(c);
  }
  for (const a of agentes) {
    const cards = cardsByAgent.get(a.user_id) || [];
    const statusToday = a.status && a.updated_at && new Date(a.updated_at).toDateString() === new Date().toDateString();
    if (!cards.length && !statusToday && !people.has(a.user_id)) continue;
    const p = person({ user_id: a.user_id, nome: a.nome, avatar_url: a.avatar_url });
    for (const [tipo, icone] of [['video', 'edicao'], ['arte', 'arte']]) {
      const list = cards.filter((c) => c.tipo === tipo);
      add(p, icone, list.length, `trabalhou em ${plural(list.length, tipo === 'arte' ? 'arte' : 'card', tipo === 'arte' ? 'artes' : 'cards')}`,
        list.map((c) => `${clip(c.cliente || '', 24)}${c.agent_step ? ` (${clip(c.agent_step, 30)})` : ''}`));
    }
    if (statusToday && !p.items.length) add(p, 'atendimento', 1, pdfText(a.status, 90));
  }
  const pessoas = [...people.values()].filter((p) => p.items.length)
    .sort((a, b) => (a.agent === b.agent ? b.weight - a.weight : a.agent ? 1 : -1));
  if (photos) await Promise.all(pessoas.map(async (p) => { p.photo = await fetchPhoto(p.avatar, { publicUploadsUrl }); }));

  // ── entregas por cliente ──
  const clientes = new Map();
  const bump = (rows, key) => {
    for (const r of rows) {
      const nome = pdfText(r.cliente, 60);
      if (!nome) continue;
      if (!clientes.has(nome)) clientes.set(nome, { cliente: nome, entregues: [], artes: [], aprovados: [], postados: [], alteracao: [] });
      clientes.get(nome)[key].push(pdfText(r.title || '', 50));
    }
  };
  bump(entregasCli, 'entregues');
  bump(artesCli, 'artes');
  bump(aprovCli, 'aprovados');
  bump(postCli, 'postados');
  bump(altCli, 'alteracao');
  const porCliente = [...clientes.values()]
    .map((c) => ({ ...c, total: c.entregues.length + c.artes.length + c.aprovados.length + c.postados.length + c.alteracao.length }))
    .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente));

  const fila = Object.fromEntries(filaRows.map((r) => [r.col, r]));
  const total = (rows) => rows.reduce((s, r) => s + (r.n || 0), 0);
  const data = {
    cidades: cities?.length ? cities : null,
    numeros: {
      videos: total(entregues),
      artes: porCliente.reduce((s, c) => s + c.artes.length, 0),
      posts: total(posts),
      gravacoes: total(gravacoes),
      cardsMovidos: [...movedBy.values()].reduce((a, b) => a + b, 0),
      aprovados: porCliente.reduce((s, c) => s + c.aprovados.length, 0),
      alteracoes: porCliente.reduce((s, c) => s + c.alteracao.length, 0),
    },
    pessoas,
    porCliente,
    pendencias: {
      atrasados: atrasados.map((t) => ({ titulo: pdfText(t.title, 60), cliente: pdfText(t.cliente, 40), coluna: t.col, prazo: t.prazo })),
      parados: parados.map((t) => ({ titulo: pdfText(t.title, 60), cliente: pdfText(t.cliente, 40), agente: t.agente, etapa: t.agent_step, sinal: t.agent_heartbeat_at })),
      urgentes: Object.values(fila).reduce((s, r) => s + r.urgentes, 0),
      aguardando: Object.values(fila).reduce((s, r) => s + r.aguardando, 0),
      fila: { edicao: fila.edicao?.n || 0, alteracao: fila.alteracao?.n || 0, analise: fila.pre_revisao?.n || 0, revisao: fila.revisao?.n || 0 },
    },
    financeiro: financeiro ? await collectFinance(pool, cities, q) : null,
  };
  return data;
}

/** Movimentações do caixa no dia, com forma e quem lançou; cobranças enviadas; totais e saldo da conta. */
async function collectFinance(pool, cities, q) {
  const { rows: [col] } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_reserve_movements' AND column_name = 'city'`
  ).catch(() => ({ rows: [] }));
  const cityCash = col && cities?.length ? 'AND m.city = ANY($1::text[])' : '';
  const params = col && cities?.length ? [cities] : [];
  const [movs, cobrancas, saldo] = await Promise.all([
    q(`SELECT m.id, m.type, m.amount, m.description, m.date, m.created_at, m.is_reserve,
              substring(m.description from 'ID: ([0-9a-f-]{36})') AS ref_id
         FROM cash_reserve_movements m
        WHERE (${TODAY_OF('m.created_at')} OR m.date = ${BR_TODAY}) ${cityCash}
        ORDER BY m.created_at`, params),
    q(`SELECT b.message_type, b.status, c.company_name AS cliente, b.sent_at
         FROM billing_messages b LEFT JOIN clients c ON c.id = b.client_id
        WHERE ${TODAY_OF('b.sent_at')} ${cities?.length ? 'AND (c.city IS NULL OR c.city = ANY($1::text[]))' : ''} ORDER BY b.sent_at`),
    q(`SELECT COALESCE(SUM(CASE WHEN m.type = 'entrada' THEN m.amount ELSE -m.amount END) FILTER (WHERE NOT m.is_reserve), 0) AS conta
         FROM cash_reserve_movements m WHERE true ${cityCash}`, params),
  ]);
  const ids = movs.map((m) => m.ref_id).filter(Boolean);
  const [logs, links, revenues, expenses] = ids.length ? await Promise.all([
    q(`SELECT DISTINCT ON (l.entity_id) l.entity_id, coalesce(nullif(p.display_name, ''), p.name) AS nome
         FROM financial_activity_log l LEFT JOIN profiles p ON p.id = l.user_id
        WHERE l.entity_id = ANY($1::uuid[]) ORDER BY l.entity_id, l.created_at DESC`, [ids]),
    q(`SELECT revenue_id FROM payment_links WHERE revenue_id = ANY($1::uuid[]) AND (status = 'pago' OR paid_at IS NOT NULL)`, [ids]),
    q(`SELECT r.id, c.company_name AS cliente, r.description FROM revenues r LEFT JOIN clients c ON c.id = r.client_id WHERE r.id = ANY($1::uuid[])`, [ids]),
    q(`SELECT e.id, e.description, ec.name AS categoria FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id WHERE e.id = ANY($1::uuid[])`, [ids]),
  ]) : [[], [], [], []];
  const who = new Map(logs.map((l) => [l.entity_id, l.nome]));
  const viaInfinite = new Set(links.map((l) => l.revenue_id));
  const rev = new Map(revenues.map((r) => [r.id, r]));
  const exp = new Map(expenses.map((e) => [e.id, e]));
  const movimentos = movs.filter((m) => !m.is_reserve).map((m) => {
    const isRev = /^\[Receita\]/.test(m.description || '');
    const isExp = /^\[Despesa\]/.test(m.description || '');
    const r = m.ref_id && rev.get(m.ref_id);
    const e = m.ref_id && exp.get(m.ref_id);
    const descricao = r ? (r.cliente || r.description || 'Receita avulsa')
      : e ? `${e.description || 'Despesa'}${e.categoria ? ` · ${e.categoria}` : ''}`
        : String(m.description || '').replace(/^\[(Receita|Despesa)\]\s*/, '').replace(/\s*-\s*ID: [0-9a-f-]{36}$/, '') || '—';
    const forma = isRev ? (viaInfinite.has(m.ref_id) ? 'InfinitePay' : 'Baixa manual')
      : isExp ? 'Despesa paga' : m.type === 'entrada' ? 'Entrada manual' : 'Saída manual';
    const quem = isRev && viaInfinite.has(m.ref_id) ? 'InfinitePay (automático)' : (m.ref_id && who.get(m.ref_id)) || '—';
    return { tipo: m.type === 'entrada' ? 'entrada' : 'saida', descricao: pdfText(descricao, 60), forma, valor: roundMoney(m.amount), quem: clip(quem, 30) };
  });
  const entradas = roundMoney(movimentos.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0));
  const saidas = roundMoney(movimentos.filter((m) => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0));
  return {
    movimentos,
    mensalidades: movimentos.filter((m) => m.forma === 'InfinitePay' || m.forma === 'Baixa manual').length,
    cobrancas: cobrancas.map((b) => ({ cliente: pdfText(b.cliente, 50) || '—', tipo: b.message_type, status: b.status })),
    entradas,
    saidas,
    saldoDia: roundMoney(entradas - saidas),
    saldoConta: saldo[0] ? roundMoney(saldo[0].conta) : null,
  };
}

const COLUMN_LABEL = { edicao: 'Edição', alteracao: 'Alteração' };
const COBRANCA_LABEL = { cobranca: 'Cobrança', lembrete: 'Lembrete', relatorio: 'Relatório do mês', agradecimento: 'Agradecimento', recibo: 'Recibo' };

/** Documento do lib/billingPdf.mjs para o resumo. financeiro = mostrar a seção (null nos dados = sem permissão). */
export function dailyPdfSpec(d, { date = new Date(), financeiro = true } = {}) {
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(date);
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(date);
  const lugar = d.cidades?.length ? d.cidades.map(cityLabel).join(' e ') : 'Minaçu e Uruaçu';
  const fin = financeiro ? d.financeiro : null;
  const n = d.numeros;
  const kpis = [
    { icon: 'edicao', label: 'Vídeos entregues', value: n.videos, highlight: true },
    { icon: 'arte', label: 'Artes', value: n.artes },
    { icon: 'post', label: 'Posts publicados', value: n.posts },
    { icon: 'gravacao', label: 'Gravações feitas', value: n.gravacoes },
    { icon: 'cards', label: 'Cards movidos', value: n.cardsMovidos },
    { icon: 'aprovacao', label: 'Aprovados', value: n.aprovados },
    ...(fin ? [
      { icon: 'entrada', label: 'Entradas do caixa', value: fmtMoney(fin.entradas), small: true, note: plural(fin.movimentos.filter((m) => m.tipo === 'entrada').length, 'movimento', 'movimentos') },
      { icon: 'saida', label: 'Saídas do caixa', value: fmtMoney(fin.saidas), small: true, note: plural(fin.movimentos.filter((m) => m.tipo === 'saida').length, 'movimento', 'movimentos') },
    ] : [{ icon: 'alteracao', label: 'Em alteração', value: n.alteracoes }]),
  ];
  const sections = [{ type: 'kpis', items: kpis }];

  sections.push(d.pessoas.length
    ? { title: 'Quem fez o quê', type: 'people', people: d.pessoas }
    : { title: 'Quem fez o quê', text: 'Ninguém registrou atividade no sistema hoje.' });

  if (d.porCliente.length) {
    // número grande e o primeiro título embaixo ("+2" quando há mais), para a tabela caber no celular
    const cell = (list) => (list.length ? { text: String(list.length), bold: true, sub: `${clip(list.filter(Boolean)[0] || '', 34)}${list.length > 1 ? ` +${list.length - 1}` : ''}` } : { text: '—', color: '#B5B5BD' });
    sections.push({
      title: 'Entregas do dia por cliente',
      type: 'table',
      columns: [{ label: 'Cliente', width: 123 }, { label: 'Entregues' }, { label: 'Aprovados' }, { label: 'Postados' }, { label: 'Alteração' }],
      rows: d.porCliente.slice(0, 25).map((c) => [
        { text: c.cliente, bold: true },
        cell([...c.entregues, ...c.artes.map((t) => `arte: ${t}`)]),
        cell(c.aprovados), cell(c.postados), cell(c.alteracao),
      ]),
    });
  } else {
    sections.push({ title: 'Entregas do dia por cliente', text: 'Nenhuma entrega, aprovação ou post registrado hoje.' });
  }

  if (fin) {
    sections.push(fin.movimentos.length
      ? {
        title: 'Financeiro do dia',
        type: 'table',
        columns: [{ label: 'Cliente / descrição' }, { label: 'Forma', width: 100 }, { label: 'Quem lançou', width: 104 }, { label: 'Valor', width: 92, align: 'right' }],
        rows: fin.movimentos.map((m) => [
          { text: m.descricao, bold: true, sub: m.tipo === 'entrada' ? 'Entrada' : 'Saída' },
          m.forma, m.quem,
          { text: `${m.tipo === 'entrada' ? '+' : '−'} ${fmtMoney(m.valor)}`, bold: true, color: m.tipo === 'entrada' ? '#1F9D55' : '#D64545' },
        ]),
        totals: [
          { label: 'Entradas', value: fmtMoney(fin.entradas) },
          { label: 'Saídas', value: `− ${fmtMoney(fin.saidas)}` },
          ...(fin.saldoConta !== null ? [{ label: 'Saldo da conta', value: fmtMoney(fin.saldoConta) }] : []),
        ],
        total: { label: 'Saldo do dia', value: `${fin.saldoDia < 0 ? '− ' : ''}${fmtMoney(Math.abs(fin.saldoDia))}` },
      }
      : { title: 'Financeiro do dia', text: `Nenhuma movimentação no caixa hoje.${fin.saldoConta !== null ? ` Saldo da conta: ${fmtMoney(fin.saldoConta)}.` : ''}` });
    if (fin.cobrancas.length) {
      sections.push({
        title: 'Cobranças enviadas',
        bullets: fin.cobrancas.map((b) => `${b.cliente} · ${COBRANCA_LABEL[b.tipo] || b.tipo}${b.status && b.status !== 'enviada' ? ` (${b.status})` : ''}`),
      });
    }
  }

  const p = d.pendencias;
  const pend = [
    ...p.atrasados.map((t) => `Atrasado em ${COLUMN_LABEL[t.coluna] || t.coluna}: ${clip(t.cliente || '', 28)} · ${clip(t.titulo, 50)}`),
    ...p.parados.map((t) => `Parado há mais de 30 min: ${clip(t.agente || 'agente', 20)} · ${clip(t.cliente || '', 24)} · ${clip(t.titulo, 40)}${t.etapa ? ` (${clip(t.etapa, 24)})` : ''}`),
    ...(p.urgentes ? [`${plural(p.urgentes, 'card urgente', 'cards urgentes')} na fila`] : []),
    ...(p.aguardando ? [`${plural(p.aguardando, 'card aguardando', 'cards aguardando')} material`] : []),
  ];
  sections.push({
    title: 'Pendências para amanhã',
    need: 50 + Math.max(1, pend.length) * 22, // a lista curta não quebra entre páginas
    ...(pend.length ? { bullets: pend } : { text: 'Nada atrasado nem parado.' }),
    note: `Fila agora: Edição ${p.fila.edicao} · Alteração ${p.fila.alteracao} · Análise ${p.fila.analise} · Revisão ${p.fila.revisao}`,
  });

  return {
    kind: 'resumo',
    title: `Resumo do dia · ${dia}`,
    subtitle: `${semana.charAt(0).toUpperCase()}${semana.slice(1)} · ${lugar}`,
    issued: new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date),
    sections,
    footerNote: fin ? 'Documento interno da Pulse, com dados financeiros: não encaminhe a clientes.' : 'Documento interno da Pulse.',
    footerContact: 'Gerado pelo Assistente PULSE com os dados do sistema',
  };
}

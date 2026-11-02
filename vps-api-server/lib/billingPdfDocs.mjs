// ─── Conteúdo dos 3 PDFs da Ísis (cobrança, relatório do mês, agradecimento) ───────────────────────────────────
// "Da pra melhorar esses pdf, deixar mais detalhado e profissional" (usuário, 01/11/2026). Funções puras: recebem os
// dados já buscados (billingIsisRoutes.mjs) e devolvem o doc do renderPdf (lib/billingPdf.mjs). Nada inventado: bloco
// sem dado não aparece (plano sem quantidades, rede social não conectada, mês sem posts…).

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR'));
const iso = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : '');
const dataBr = (v) => (iso(v) ? iso(v).split('-').reverse().join('/') : '');
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (month) => MESES[Number(String(month).slice(5, 7)) - 1] || '';
const monthLabel = (month) => `${monthName(month)} de ${String(month).slice(0, 4)}`;
const comp = (month) => `${String(month).slice(5, 7)}/${String(month).slice(0, 4)}`;
const cityName = (c) => ({ uruacu: 'Uruaçu', minacu: 'Minaçu' }[c] || c || '');
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

const SIGNATURE = { signature: 'Ísis', role: 'Social media · Agência Pulse' };

/** "Previsto no plano: 4 Reels · 2 Criativos · …" (só o que o plano tem). */
export function planContents(plan = {}) {
  const parts = [
    [plan.reels_qty, 'Reels'], [plan.creatives_qty, 'Criativos'], [plan.stories_qty, 'Stories'],
    [plan.arts_qty, plan.arts_qty === 1 ? 'arte' : 'artes'], [plan.recording_sessions, plan.recording_sessions === 1 ? 'gravação' : 'gravações'],
  ].filter(([n]) => Number(n) > 0).map(([n, l]) => `${n} ${l}`);
  return parts.length ? `Previsto no plano: ${parts.join(' · ')}` : '';
}

function issuerParty(issuer = {}) {
  return {
    title: 'Emitente',
    name: issuer.name || 'Agência Pulse',
    lines: [
      issuer.document ? `CPF/CNPJ: ${issuer.document}` : '',
      issuer.city ? `${cityName(issuer.city)} · GO` : '',
      issuer.contact ? `Contato: ${issuer.contact}` : '',
      '@agenciapulse',
    ],
  };
}

function clientParty(client = {}) {
  return {
    title: 'Cliente',
    name: client.name,
    lines: [
      client.responsible ? `Responsável: ${client.responsible}` : '',
      client.plan ? `Plano: ${client.plan}` : '',
      client.city ? `${cityName(client.city)} · GO` : '',
    ],
  };
}

/** Situação de cada mensalidade (tabela da conta). */
function revenueSituation(r, today) {
  if (['recebida', 'pago'].includes(r.status)) return { text: r.paid_at ? `Paga em ${dataBr(r.paid_at)}` : 'Paga', color: '#1F9D55', bold: true };
  if (r.status === 'cancelada') return { text: 'Cancelada', color: '#6B6B73' };
  if (iso(r.due_date) && iso(r.due_date) < today) return { text: 'Vencida', color: '#D64545', bold: true };
  return { text: 'Em aberto', color: '#F15A24', bold: true };
}

/**
 * O que foi entregue no mês, item a item, com o que passou do plano (relatório para mostrar serviço; usuário,
 * 01/11/2026: "dê ênfase em serviços entregues, ainda mais se for acima do plano contratado"). Só itens entregues;
 * extra = quanto passou do plano (0 quando ficou no plano ou abaixo: abaixo não aparece como falta).
 */
export function deliveredItems(numbers, plan = {}) {
  if (!numbers) return [];
  const byType = Object.fromEntries((numbers.deliveries.videos.by_type || []).map((t) => [t.type, t.total]));
  const rows = [
    { label: 'Reels', done: byType.Reels || 0, goal: plan.reels_qty, one: 'Reels', unit: 'Reels' },
    { label: 'Criativos', done: byType.Criativos || 0, goal: plan.creatives_qty, one: 'criativo', unit: 'criativos' },
    { label: 'Stories', done: byType.Stories || 0, goal: plan.stories_qty, one: 'story', unit: 'stories' },
    { label: 'Artes', done: numbers.deliveries.arts.total, goal: plan.arts_qty, one: 'arte', unit: 'artes' },
    { label: 'Gravações', done: numbers.deliveries.recordings.done, goal: plan.recording_sessions, one: 'gravação', unit: 'gravações' },
  ];
  for (const t of numbers.deliveries.videos.by_type || []) {
    if (!['Reels', 'Criativos', 'Stories'].includes(t.type)) rows.push({ label: t.type, done: t.total, goal: 0, one: t.type, unit: t.type });
  }
  return rows.filter((r) => Number(r.done) > 0).map((r) => {
    const goal = Number(r.goal) || 0;
    const done = Number(r.done) || 0;
    return { label: r.label, done, goal, extra: goal && done > goal ? done - goal : 0, met: goal > 0 && done === goal, one: r.one, unit: r.unit };
  });
}

/** Quadros de entrega: o que passou do plano ganha o selo verde; o que bateu o plano, "plano completo". */
function deliveryTiles(items) {
  return items.map((r) => ({
    label: r.label,
    value: r.done,
    highlight: r.extra > 0,
    badge: r.extra > 0 ? `+${r.extra} além do plano` : r.met ? 'plano completo' : '',
  }));
}

/** "Entregamos acima do plano: +3 vídeos e +2 artes além do contratado." (null se nada passou) */
export function aboveSummary(items) {
  const above = items.filter((r) => r.extra > 0);
  if (!above.length) return null;
  const parts = above.map((r) => `+${r.extra} ${r.extra === 1 ? r.one : r.unit}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  return `Neste mês entregamos ${list} além do que o seu plano prevê.`;
}

/**
 * Cobrança (dia D e lembrete). d = { month, today, dueDate, amount, status, client: { name, responsible, city, plan },
 * plan, issuer: { name, document, city, contact }, payment: {...}, history: revenues anteriores }
 */
export function cobrancaDoc(d) {
  const contents = planContents(d.plan);
  const history = (d.history || []).slice(0, 6);
  const open = history.filter((r) => !['recebida', 'pago', 'cancelada'].includes(r.status));
  const openTotal = open.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const late = d.status === 'vencido';
  return {
    kind: 'cobranca',
    title: `Mensalidade de ${monthLabel(d.month)}`,
    subtitle: `Competência ${comp(d.month)} · vencimento em ${dataBr(d.dueDate)}`,
    status: late ? 'vencido' : 'aberto',
    intro: late
      ? `Olá, ${first(d.client.responsible) || d.client.name}! A mensalidade de ${monthName(d.month)} venceu em ${dataBr(d.dueDate)} e ainda não consta como paga. Se já pagou, pode desconsiderar este aviso.`
      : `Olá, ${first(d.client.responsible) || d.client.name}! Segue a cobrança da mensalidade de ${monthName(d.month)} do seu plano com a Pulse. O pagamento pode ser feito pelo Pix (preferencial) ou pelo cartão, nas opções abaixo.`,
    parties: [issuerParty(d.issuer), clientParty(d.client)],
    meta: [
      { label: 'Competência', value: comp(d.month) },
      { label: 'Emissão', value: dataBr(d.today) },
      { label: 'Vencimento', value: dataBr(d.dueDate), color: late ? '#D64545' : undefined },
      { label: 'Valor', value: brl(d.amount), color: '#F15A24' },
    ],
    table: {
      title: 'Discriminação',
      columns: [{ label: 'Descrição' }, { label: 'Competência', width: 100, align: 'center' }, { label: 'Valor', width: 110, align: 'right' }],
      rows: [[{ text: `Mensalidade · ${d.client.plan || 'plano mensal'}`, sub: contents, bold: true }, comp(d.month), brl(d.amount)]],
      total: { label: 'Total a pagar', value: brl(d.amount) },
    },
    payment: d.payment,
    sections: [
      ...(history.length ? [{
        title: open.length ? `Situação da conta · em aberto antes deste mês: ${brl(openTotal)}` : 'Situação da conta',
        type: 'table',
        columns: [{ label: 'Competência' }, { label: 'Vencimento', width: 110, align: 'center' }, { label: 'Valor', width: 110, align: 'right' }, { label: 'Situação', width: 140, align: 'right' }],
        rows: history.map((r) => [comp(iso(r.reference_month).slice(0, 7)), dataBr(r.due_date) || '—', brl(r.amount), revenueSituation(r, d.today)]),
      }] : []),
      {
        title: 'Informações',
        bullets: [
          d.payment?.payUrl ? 'No botão "Pagar agora" (ou no link da mensagem), você copia o Pix com um toque ou paga no cartão.' : '',
          d.payment?.cardLink ? 'Pelo checkout da InfinitePay, a confirmação do pagamento é automática.' : '',
          'O QR Code e o Pix copia e cola já levam o valor desta mensalidade.',
          'Se o pagamento já foi feito, desconsidere esta cobrança.',
        ].filter(Boolean),
      },
    ],
    closing: { text: 'Obrigada pela confiança no trabalho da Pulse!', ...SIGNATURE },
  };
}

const NET_ROWS = [
  ['reach', 'Contas alcançadas'], ['views', 'Visualizações'], ['interactions', 'Interações'], ['profile_views', 'Visitas ao perfil'],
  ['followers_total', 'Seguidores'], ['followers_gained', 'Novos seguidores'], ['website_clicks', 'Cliques no link'], ['posts_count', 'Publicações'],
];

/**
 * Relatório do mês (usuário, 01/11/2026): a 1ª página já é o resumo de bater o olho (faixa clara com o cliente, o
 * agradecimento em uma linha e os números em quadros com ícone, "entregue × plano", selo laranja no que passou);
 * stories do mês quando o plano tem stories; destaques em moldura de post; calendário editorial com o nome de cada
 * data e o que vamos fazer; portal; equipe; fecho. O que não foi entregue não aparece com destaque.
 * d = { ref, prev, next, client, plan, numbers, network, suggestions, clientLogo?, portalUrl?, recordings?,
 *       calendar?, highlights?, instagram?, storiesPosted?, team?: { people, agents }, contact? }
 */
export function relatorioDoc(d) {
  const n = d.numbers;
  const net = d.network?.connected && d.network.current ? d.network : null;
  // rede social: só o que subiu ou se manteve (o relatório mostra resultado, não queda)
  const netRows = net ? NET_ROWS.filter(([k]) => net.current[k] !== null && net.current[k] !== undefined && !(Number(net.change?.[k]) < 0))
    .map(([k, label]) => ({ label, previous: net.previous?.[k] ?? null, current: net.current[k], change: net.change?.[k] ?? null })) : [];
  const items = deliveredItems(n, d.plan);
  const acima = aboveSummary(items);
  const suggestions = String(d.suggestions || '').split('\n').map((s) => s.replace(/^[•\-–*]\s*/, '').trim()).filter(Boolean);
  const period = n.period ? `${dataBr(n.period.since)} a ${dataBr(n.period.until)}` : monthLabel(d.ref);
  const nome = first(d.client.responsible) || d.client.name;
  const handle = d.instagram || `@${String(d.client.name || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

  // stories: quadro próprio quando o plano prevê stories (plano diário)
  const storiesPlan = Number(d.plan?.stories_qty) || 0;
  const storiesProduced = items.find((r) => r.label === 'Stories')?.done || 0;
  const storiesPosted = d.storiesPosted ?? storiesProduced;
  const storiesTotal = Math.max(storiesPosted, storiesProduced);
  const storiesExtra = storiesPlan && storiesTotal > storiesPlan ? storiesTotal - storiesPlan : 0;

  const ICON = { Reels: 'video', Criativos: 'video', Stories: 'story', Artes: 'arte', Gravações: 'gravacao' };
  const stats = [
    ...items.filter((r) => !(storiesPlan && r.label === 'Stories'))
      .map((r) => ({ icon: ICON[r.label] || 'video', label: r.label, value: r.done, plan: r.goal || 0, extra: r.extra })),
    ...(n.deliveries.posts.total ? [{ icon: 'post', label: 'Posts publicados', value: n.deliveries.posts.total }] : []),
    ...(n.time.total_hours > 0 ? [{ icon: 'horas', label: 'Horas dedicadas', value: `${num(n.time.total_hours)} h` }] : []),
  ];

  // calendário editorial: gravações agendadas + feriados (arte de aviso) + datas do segmento (arte comemorativa)
  const hora = (t) => {
    const [h, mi] = String(t || '').split(':');
    return h ? `${Number(h)}h${mi && mi !== '00' ? mi : ''}` : '';
  };
  const recs = (d.recordings || []).filter((r) => String(r.date).slice(0, 7) === d.next);
  const marks = [
    ...recs.map((r) => ({ date: String(r.date).slice(0, 10), kind: 'gravacao', name: 'Gravação', tag: hora(r.time) || 'agendada', time: hora(r.time) })),
    ...(d.calendar || []).map((x) => (x.kind === 'feriado'
      ? { date: x.date, kind: 'feriado', name: x.label, tag: 'Arte de aviso', idea: x.idea }
      : { date: x.date, kind: 'sazonal', name: x.label, tag: 'Arte comemorativa', idea: x.idea })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'gravacao' ? -1 : 1));
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} · ${semana[new Date(`${iso}T12:00:00Z`).getUTCDay()]}`;
  const ideia = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');

  return {
    kind: 'relatorio',
    summary: { client: d.client.name, logo: d.clientLogo || null, month: monthLabel(d.ref) },
    title: `O que entregamos em ${monthName(d.ref)}`,
    status: acima ? 'acima' : null,
    intro: `Obrigada por mais um mês com a Pulse, ${nome}! Aqui está, de relance, tudo o que fizemos juntos em ${monthName(d.ref)}.`,
    sections: [
      // o portal logo na 1ª página (usuário, 01/11/2026: "o cliente já tem que ver 'confira todos os seus resultados
      // no portal' e depois vem o relatório completo")
      ...(d.portalUrl ? [{
        type: 'portal',
        url: d.portalUrl,
        heading: 'Confira todos os seus resultados no portal',
        text: 'Os vídeos e os conteúdos do mês, o que está esperando a sua aprovação e as próximas gravações para confirmar.',
      }] : []),
      ...(stats.length ? [{ type: 'stats', items: stats }] : []),
      ...(acima ? [{ type: 'callout', heading: 'Acima do plano contratado', text: acima }] : []),
      ...(storiesPlan ? [{
        title: 'Stories do mês',
        type: 'cards',
        items: [
          { label: 'Stories postados', value: storiesPosted, highlight: true },
          { label: 'Previstos no plano', value: storiesPlan },
          { label: 'Entrega total', value: storiesTotal, highlight: storiesExtra > 0, note: storiesExtra ? `+${storiesExtra} além do plano` : storiesTotal >= storiesPlan ? 'plano completo' : '' },
        ],
      }] : []),
      ...((d.highlights || []).length ? [{ title: 'Destaques do mês', type: 'igposts', items: d.highlights, handle, logo: d.clientLogo || null }] : []),
      ...(n.deliveries.videos.by_type.length ? [{
        title: 'Vídeos entregues',
        type: 'table',
        columns: [{ label: 'Tipo', width: 110 }, { label: 'Qtde', width: 60, align: 'center' }, { label: 'Títulos' }],
        rows: n.deliveries.videos.by_type.map((t) => [{ text: t.type, bold: true }, String(t.total), t.titles.join(' · ') + (t.total > t.titles.length ? ` · e mais ${t.total - t.titles.length}` : '')]),
      }] : []),
      ...(n.deliveries.arts.total ? [{
        title: 'Artes entregues',
        bullets: n.deliveries.arts.titles.concat(n.deliveries.arts.total > n.deliveries.arts.titles.length ? [`e mais ${n.deliveries.arts.total - n.deliveries.arts.titles.length}`] : []),
      }] : []),
      ...(n.time.total_hours > 0 ? [{
        title: `Tempo dedicado · ${num(n.time.total_hours)} horas`,
        type: 'bars',
        rows: [['Gravação', n.time.recording_hours], ['Edição', n.time.editing_hours], ['Design', n.time.design_hours]]
          .filter(([, v]) => v > 0).map(([label, v]) => ({ label, value: v, display: `${num(v)} h` })),
      }] : []),
      ...(netRows.length ? [{
        title: `Rede social${net.account ? ` · ${net.account}` : ''}`,
        type: 'compare',
        previousLabel: monthName(d.prev || '') || 'Mês anterior',
        currentLabel: monthName(d.ref),
        rows: netRows,
      }] : []),
      ...(net?.top_posts?.length ? [{
        title: 'Posts que mais alcançaram',
        type: 'table',
        columns: [{ label: 'Data', width: 64 }, { label: 'Post' }, { label: 'Alcance', width: 80, align: 'right' }, { label: 'Interações', width: 90, align: 'right' }],
        rows: net.top_posts.map((p) => [dataBr(p.date).slice(0, 5) || '—', p.caption || '(sem legenda)', num(p.reach), num(p.interactions)]),
      }] : []),
      // calendário editorial do mês que começa
      { title: `Calendário editorial de ${monthName(d.next)}`, type: 'calendar', month: d.next, marks },
      ...(marks.length ? [{
        type: 'table',
        columns: [{ label: 'Dia', width: 78 }, { label: 'Data', width: 190 }, { label: 'O que vamos fazer' }],
        rows: marks.map((mk) => (mk.kind === 'gravacao'
          ? [{ text: dia(mk.date), bold: true }, { text: 'Gravação agendada', bold: true, color: '#F15A24' }, { text: mk.time ? `Às ${mk.time}, com a nossa equipe` : 'Com a nossa equipe', color: '#F15A24' }]
          : mk.kind === 'feriado'
            ? [{ text: dia(mk.date), bold: true }, { text: mk.name, bold: true, sub: 'feriado' }, 'Vamos criar a arte de aviso do feriado']
            : [{ text: dia(mk.date), bold: true }, { text: mk.name, bold: true, sub: 'data do seu segmento' }, `Arte comemorativa: ${ideia(mk.idea)}`])),
      }] : []),
      ...(marks.some((mk) => mk.kind !== 'gravacao') ? [{ note: 'Estas artes já estão no nosso planejamento: você recebe para aprovar no portal antes de postar.' }] : []),
      ...(recs.length ? [{
        type: 'callout',
        heading: 'Confirme suas gravações no portal',
        text: `${recs.length === 1 ? 'A data acima já está reservada' : `As ${recs.length} datas acima já estão reservadas`} para você. Confirme no seu portal para a equipe chegar com tudo pronto.`,
      }] : []),
      ...(suggestions.length ? [{ title: `Mais ideias para ${monthName(d.next)}`, type: 'callout', heading: 'O que propomos para o próximo mês', text: suggestions.map((s) => `• ${s}`).join('\n') }] : []),
      ...((d.team?.people || []).length ? [{ title: 'Quem cuidou do seu projeto', type: 'team', people: d.team.people }] : []),
      ...((d.team?.agents || []).length ? [{ title: 'Agentes de IA da Pulse no seu projeto', type: 'team', people: d.team.agents.map((a) => ({ ...a, agent: true })) }] : []),
    ],
    closing: {
      text: `Obrigada pela parceria e pela confiança, ${nome}. Seguimos juntos em ${monthName(d.next)}!`,
      ...SIGNATURE,
      band: d.contact ? `Dúvidas: ${d.contact}` : 'Agência Pulse',
    },
    footerPeriod: period,
  };
}

const METODO = { pix: 'Pix', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', boleto: 'Boleto' };

/**
 * Recibo do pagamento (vai com o obrigado). d = { month, paidAt, amount, amountWords, method?, client, plan, issuer }
 */
export function reciboDoc(d) {
  return {
    kind: 'recibo',
    title: `Recibo · mensalidade de ${monthName(d.month)}`,
    subtitle: `Pagamento recebido em ${dataBr(d.paidAt)}`,
    status: 'pago',
    intro: `Recebemos de ${d.client.name} a importância de ${brl(d.amount)} (${d.amountWords}), referente à mensalidade de ${monthLabel(d.month)}${d.client.plan ? ` do ${d.client.plan}` : ''}, e damos plena quitação deste valor.`,
    parties: [issuerParty(d.issuer), clientParty(d.client)],
    meta: [
      { label: 'Referência', value: comp(d.month) },
      { label: 'Pago em', value: dataBr(d.paidAt) },
      { label: 'Forma', value: METODO[d.method] || 'Pagamento confirmado' },
      { label: 'Valor', value: brl(d.amount), color: '#1F9D55' },
    ],
    table: {
      title: 'Discriminação',
      columns: [{ label: 'Descrição' }, { label: 'Competência', width: 100, align: 'center' }, { label: 'Valor', width: 110, align: 'right' }],
      rows: [[{ text: `Mensalidade · ${d.client.plan || 'plano mensal'}`, sub: planContents(d.plan), bold: true }, comp(d.month), brl(d.amount)]],
      total: { label: 'Total pago', value: brl(d.amount) },
    },
    closing: { text: 'Obrigada pela parceria. Seguimos juntos!', ...SIGNATURE },
  };
}

/**
 * Agradecimento (D−5): agradece e mostra o que o mês rendeu. Nada que soe como cobrança de gravação (usuário,
 * 01/11/2026): só o que foi feito; a dica entra quando ajuda e em tom positivo.
 * d = { ref, today, client, plan, attendance: { done, scheduled, cancelled, avg }, numbers?, tip, dueDate, amount }
 */
export function agradecimentoDoc(d) {
  const a = d.attendance;
  const items = deliveredItems(d.numbers, d.plan);
  const acima = aboveSummary(items);
  return {
    kind: 'agradecimento',
    title: `Obrigada pela parceria em ${monthName(d.ref)}!`,
    subtitle: `${d.client.name} · ${monthLabel(d.ref)}`,
    intro: `Olá, ${first(d.client.responsible) || d.client.name}! Obrigada por mais um mês com a Pulse. Veja o que construímos juntos em ${monthName(d.ref)}.`,
    cards: [
      ...(a.done ? [{ label: 'Gravações feitas', value: a.done, highlight: true }] : []),
      ...(a.avg !== null && a.avg !== undefined ? [{ label: 'Vídeos por gravação', value: num(a.avg) }] : []),
      ...(d.numbers ? [{ label: 'Vídeos entregues', value: d.numbers.deliveries.videos.total, highlight: !a.done }] : []),
      { label: 'Próximo vencimento', value: dataBr(d.dueDate), note: d.amount ? brl(d.amount) : '' },
    ],
    sections: [
      ...(acima ? [{ type: 'callout', tone: 'verde', heading: 'Acima do plano contratado', text: acima }] : []),
      ...(items.length ? [{ title: `O que entregamos em ${monthName(d.ref)}`, type: 'tiles', rows: deliveryTiles(items) }] : []),
    ],
    closing: {
      text: `Lembrete: a mensalidade de ${monthName(iso(d.dueDate).slice(0, 7))} vence em ${dataBr(d.dueDate)}${d.amount ? ` (${brl(d.amount)})` : ''}; no dia, você recebe a cobrança com o Pix e o link do cartão. Obrigada por caminhar com a gente!`,
      ...SIGNATURE,
    },
  };
}

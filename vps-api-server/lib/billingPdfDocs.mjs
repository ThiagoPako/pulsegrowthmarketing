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

/** Linhas de "entregas × plano" a partir dos números do relatório. */
export function deliveryProgress(numbers, plan = {}) {
  if (!numbers) return [];
  const byType = Object.fromEntries((numbers.deliveries.videos.by_type || []).map((t) => [t.type, t.total]));
  const rec = numbers.deliveries.recordings;
  const rows = [
    { label: 'Reels', done: byType.Reels || 0, goal: plan.reels_qty },
    { label: 'Criativos', done: byType.Criativos || 0, goal: plan.creatives_qty },
    { label: 'Stories', done: byType.Stories || 0, goal: plan.stories_qty },
    { label: 'Artes', done: numbers.deliveries.arts.total, goal: plan.arts_qty },
    { label: 'Gravações', done: rec.done, goal: plan.recording_sessions },
  ];
  for (const t of numbers.deliveries.videos.by_type || []) {
    if (!['Reels', 'Criativos', 'Stories'].includes(t.type)) rows.push({ label: t.type, done: t.total, goal: 0 });
  }
  return rows.filter((r) => Number(r.goal) > 0 || Number(r.done) > 0);
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
          d.payment?.cardLink ? 'Pelo link do cartão, a confirmação do pagamento é automática.' : '',
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
 * Relatório do mês. d = { ref (mês do relatório), next (mês atual), today, client, plan, numbers, network, suggestions }
 */
export function relatorioDoc(d) {
  const n = d.numbers;
  const rec = n.deliveries.recordings;
  const net = d.network?.connected && d.network.current ? d.network : null;
  const netRows = net ? NET_ROWS.filter(([k]) => net.current[k] !== null && net.current[k] !== undefined)
    .map(([k, label]) => ({ label, previous: net.previous?.[k] ?? null, current: net.current[k], change: net.change?.[k] ?? null })) : [];
  const progress = deliveryProgress(n, d.plan);
  const suggestions = String(d.suggestions || '').split('\n').map((s) => s.replace(/^[•\-–*]\s*/, '').trim()).filter(Boolean);
  const period = n.period ? `${dataBr(n.period.since)} a ${dataBr(n.period.until)}` : monthLabel(d.ref);
  return {
    kind: 'relatorio',
    title: `Relatório de ${monthLabel(d.ref)}`,
    subtitle: `${d.client.name} · período de ${period}`,
    intro: `Olá, ${first(d.client.responsible) || d.client.name}! Este é o resumo do que a Pulse produziu e publicou no seu perfil em ${monthName(d.ref)}: as entregas comparadas ao plano, o tempo dedicado${net ? ', os resultados da rede social' : ''} e o que sugerimos para ${monthName(d.next)}.`,
    parties: [issuerParty(d.issuer), clientParty(d.client)],
    cards: [
      { label: 'Vídeos', value: n.deliveries.videos.total, highlight: true },
      { label: 'Artes', value: n.deliveries.arts.total },
      { label: 'Posts', value: n.deliveries.posts.total },
      { label: 'Horas dedicadas', value: n.time.total_hours > 0 ? `${num(n.time.total_hours)} h` : '—' },
    ],
    sections: [
      ...(progress.length ? [{ title: 'Entregas × plano contratado', type: 'progress', rows: progress }] : []),
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
      ...(rec.scheduled || rec.done ? [{
        title: 'Gravações',
        type: 'table',
        columns: [{ label: 'Agendadas', align: 'center' }, { label: 'Realizadas', align: 'center' }, { label: 'Canceladas', align: 'center' }, { label: 'Vídeos gravados', align: 'center' }, { label: 'Média por gravação', align: 'center' }],
        rows: [[String(rec.scheduled), { text: String(rec.done), bold: true }, String(rec.cancelled), String(rec.videos_recorded), rec.avg_videos_per_recording === null ? '—' : num(rec.avg_videos_per_recording)]],
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
        title: 'Posts de destaque',
        type: 'table',
        columns: [{ label: 'Data', width: 64 }, { label: 'Post' }, { label: 'Alcance', width: 80, align: 'right' }, { label: 'Interações', width: 90, align: 'right' }],
        rows: net.top_posts.map((p) => [dataBr(p.date).slice(0, 5) || '—', p.caption || '(sem legenda)', num(p.reach), num(p.interactions)]),
      }] : []),
      ...(suggestions.length ? [{ title: `Sugestões para ${monthName(d.next)}`, type: 'callout', heading: 'O que propomos para o próximo mês', text: suggestions.map((s) => `• ${s}`).join('\n') }] : []),
    ],
    closing: { text: 'Qualquer dúvida sobre o relatório, é só chamar. Bora para mais um mês!', ...SIGNATURE },
  };
}

/**
 * Agradecimento (D−5). d = { ref, today, client, plan, attendance: { done, scheduled, cancelled, avg }, numbers?,
 * tip, dueDate, amount }
 */
export function agradecimentoDoc(d) {
  const a = d.attendance;
  const rate = a.scheduled ? Math.round((a.done / a.scheduled) * 100) : null;
  const progress = deliveryProgress(d.numbers, d.plan);
  return {
    kind: 'agradecimento',
    title: `Obrigada pela parceria em ${monthName(d.ref)}!`,
    subtitle: `${d.client.name} · agendas de ${monthLabel(d.ref)}`,
    intro: `Olá, ${first(d.client.responsible) || d.client.name}! Obrigada pela parceria em ${monthName(d.ref)}. Veja como foram as agendas e as entregas do mês: cada gravação feita vira conteúdo no ar.`,
    cards: [
      { label: 'Gravações feitas', value: `${a.done} de ${a.scheduled}`, highlight: true, note: rate === null ? '' : `${rate}% das agendas aproveitadas` },
      { label: 'Vídeos por gravação', value: a.avg === null ? '—' : num(a.avg) },
      { label: 'Próximo vencimento', value: dataBr(d.dueDate), note: d.amount ? brl(d.amount) : '' },
    ],
    sections: [
      {
        title: 'Agendas do mês',
        type: 'table',
        columns: [{ label: 'Agendadas', align: 'center' }, { label: 'Realizadas', align: 'center' }, { label: 'Canceladas', align: 'center' }, { label: 'Aproveitamento', align: 'center' }],
        rows: [[String(a.scheduled), { text: String(a.done), bold: true }, String(a.cancelled || 0), rate === null ? '—' : { text: `${rate}%`, bold: true, color: rate >= 100 ? '#1F9D55' : '#F15A24' }]],
      },
      ...(progress.length ? [{ title: `O que entregamos em ${monthName(d.ref)}`, type: 'progress', rows: progress }] : []),
      { title: 'Como melhorar a entrega', type: 'callout', heading: rate !== null && rate >= 100 ? 'Agenda em dia' : 'Uma sugestão para o próximo mês', text: d.tip },
    ],
    closing: {
      text: `Lembrete: a mensalidade de ${monthName(iso(d.dueDate).slice(0, 7))} vence em ${dataBr(d.dueDate)}${d.amount ? ` (${brl(d.amount)})` : ''}; no dia, você recebe a cobrança com o Pix e o link do cartão. Obrigada por caminhar com a gente!`,
      ...SIGNATURE,
    },
  };
}

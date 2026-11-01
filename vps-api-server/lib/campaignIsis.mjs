// ─── Campanhas da Ísis (social media; pedido do usuário, 01/11/2026) ───────────────────────────────────────────
// A Ísis monta a campanha (estratégia + cada vídeo/arte com data e ideia) em rascunho; a equipe aprova a estratégia e
// os vídeos vão para a Victoria escrever os roteiros. Regras puras: validar o pedido e montar o pedido à Victoria.

export const CAMPAIGN_TYPES = ['institucional', 'promocional', 'sazonal', 'lancamento', 'responsabilidade_social', 'evento', 'agro', 'sorteio', 'sorteio_qr'];

// tipo da campanha → tipo de vídeo da Victoria
const VIDEO_TYPE_BY_CAMPAIGN = {
  institucional: 'institucional',
  responsabilidade_social: 'institucional',
  promocional: 'vendas',
  sazonal: 'vendas',
  agro: 'vendas',
  sorteio: 'evento',
  sorteio_qr: 'evento',
  lancamento: 'lancamento',
  evento: 'evento',
};

export const STRATEGY_FIELDS = [
  ['publico', 'Público'],
  ['mensagem', 'Mensagem central'],
  ['oferta', 'Oferta (só a que o cliente confirmou)'],
  ['gancho', 'Gancho'],
  ['cta', 'CTA'],
  ['tom', 'Tom'],
  ['datas', 'Datas e momento'],
  ['por_que', 'Por que esta campanha agora'],
];

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

/** Valida o JSON da Ísis e devolve a campanha e os slots prontos para gravar (editorial primeiro). */
export function normalizeCampaignInput(body) {
  const name = clean(body?.name, 140);
  if (!name) fail('Dê um nome à campanha');
  const type = CAMPAIGN_TYPES.includes(body?.type) ? body.type : fail(`Tipo inválido (use ${CAMPAIGN_TYPES.join(', ')})`);
  const start = isDate(body?.start_date) ? body.start_date : fail('start_date em AAAA-MM-DD');
  const end = isDate(body?.end_date) ? body.end_date : fail('end_date em AAAA-MM-DD');
  if (end < start) fail('A campanha termina antes de começar');

  const strategy = {};
  for (const [key] of STRATEGY_FIELDS) {
    const value = clean(body?.strategy?.[key], 800);
    if (value) strategy[key] = value;
  }
  if (!strategy.mensagem || !strategy.publico) fail('A estratégia precisa pelo menos de público e mensagem central');

  const rawSlots = Array.isArray(body?.slots) ? body.slots : [];
  if (!rawSlots.length) fail('Liste os vídeos e artes da campanha em slots');
  if (rawSlots.length > 30) fail('No máximo 30 peças por campanha');
  const slots = rawSlots.map((s, i) => {
    const kind = s?.kind === 'creative' || s?.kind === 'arte' ? 'creative' : s?.kind === 'video' ? 'video' : fail(`Peça ${i + 1}: kind é video ou creative`);
    const title = clean(s?.title, 140) || fail(`Peça ${i + 1}: falta o título`);
    const postDate = s?.post_date ? (isDate(s.post_date) ? s.post_date : fail(`Peça ${i + 1}: post_date em AAAA-MM-DD`)) : null;
    if (postDate && (postDate < start || postDate > end)) fail(`Peça ${i + 1}: a data ${postDate} está fora da campanha`);
    const format = ['reels', 'story', 'criativo'].includes(s?.format) ? s.format : 'reels';
    return { kind, title, post_date: postDate, idea: clean(s?.idea, 1200), format };
  }).sort((a, b) => String(a.post_date || '9').localeCompare(String(b.post_date || '9')));

  const editorialNotes = strategyText(strategy);
  return {
    campaign: {
      name, type, objective: clean(body?.objective, 500) || null, start_date: start, end_date: end,
      videos_qty: slots.filter((s) => s.kind === 'video').length,
      creatives_qty: slots.filter((s) => s.kind === 'creative').length,
      status: 'rascunho',
      editorial: { isis: { strategy, created_at: new Date().toISOString() } },
    },
    slots: [
      { position: 0, kind: 'editorial', title: 'Estratégia da campanha (Ísis)', post_date: start, status: 'pendente', notes: editorialNotes },
      ...slots.map((s, i) => ({
        position: i + 1, kind: s.kind, title: s.title, post_date: s.post_date, status: 'pendente',
        notes: [s.idea, s.kind === 'video' ? `Formato: ${s.format}` : ''].filter(Boolean).join('\n'),
      })),
    ],
  };
}

/** Estratégia em texto (nota do slot editorial e contexto da Victoria). */
export function strategyText(strategy = {}) {
  return STRATEGY_FIELDS.filter(([k]) => strategy[k]).map(([k, label]) => `${label}: ${strategy[k]}`).join('\n');
}

/** Formato guardado na nota do slot ("Formato: story"). */
export function slotFormat(notes) {
  const m = String(notes || '').match(/Formato:\s*(reels|story|criativo)/i);
  return m ? m[1].toLowerCase() : 'reels';
}

/** O que a Ísis manda à Victoria para um vídeo da campanha. */
export function victoriaRequest(campaign, slot) {
  const strategy = campaign?.editorial?.isis?.strategy || {};
  const idea = String(slot.notes || '').replace(/\n?Formato:\s*\w+\s*$/i, '').trim();
  const lines = [
    `Roteiro para a campanha "${campaign.name}" (${campaign.type}${campaign.objective ? `, objetivo: ${campaign.objective}` : ''}).`,
    `Peça: ${slot.title}${slot.post_date ? ` · postagem em ${slot.post_date.split('-').reverse().join('/')}` : ''}.`,
    idea ? `Ideia da peça: ${idea}` : '',
    'Estratégia aprovada pela equipe:',
    strategyText(strategy) || '(sem estratégia escrita)',
    'Use só a oferta, os preços e as datas que estão na estratégia; nada inventado. O roteiro precisa conversar com as outras peças da campanha.',
  ];
  return {
    format: slotFormat(slot.notes),
    videoType: VIDEO_TYPE_BY_CAMPAIGN[campaign.type] || 'vendas',
    text: lines.filter(Boolean).join('\n'),
  };
}

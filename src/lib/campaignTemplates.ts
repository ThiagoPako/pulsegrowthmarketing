import { CampaignType, SlotKind, distributeDates } from './campaignsUtils';

/**
 * Template de slot dentro de uma campanha.
 * `weight` é a posição relativa (0..1) dentro do período da campanha.
 * `phase` explica o papel dentro do funil de vendas.
 */
export interface SlotTemplate {
  kind: SlotKind;
  title: string;
  phase: 'topo' | 'meio' | 'fundo' | 'pos';
  weight: number; // 0 = início, 1 = fim
  notes?: string;
}

export interface GeneratedSlot {
  position: number;
  kind: SlotKind;
  title: string;
  post_date: string;
  status: 'pendente';
  notes: string | null;
}

/**
 * Quantidades recomendadas de vídeos/criativos por tipo de campanha.
 * Foco sempre em VENDAS, mesmo em campanhas institucionais/eventos.
 */
export const RECOMMENDED_QUANTITIES: Record<CampaignType, { videos: number; creatives: number }> = {
  institucional: { videos: 6, creatives: 3 },
  promocional: { videos: 5, creatives: 4 },
  sazonal: { videos: 5, creatives: 3 },
  lancamento: { videos: 8, creatives: 4 },
  responsabilidade_social: { videos: 4, creatives: 2 },
  evento: { videos: 7, creatives: 4 },
};

/**
 * Templates de vídeos por tipo de campanha (ordenados pelo funil).
 * Cada template vira um slot com título, papel no funil e posição temporal sugerida.
 */
const VIDEO_TEMPLATES: Record<CampaignType, SlotTemplate[]> = {
  institucional: [
    { kind: 'video', title: 'Manifesto da marca (quem somos / propósito)', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'História do fundador / bastidores humanizados', phase: 'topo', weight: 0.15 },
    { kind: 'video', title: 'Depoimento de cliente satisfeito (prova social)', phase: 'meio', weight: 0.35 },
    { kind: 'video', title: 'Case de resultado com número / transformação', phase: 'meio', weight: 0.55 },
    { kind: 'video', title: 'Diferencial competitivo (por que escolher a gente)', phase: 'fundo', weight: 0.75 },
    { kind: 'video', title: 'Chamada para conversa/orçamento (CTA direto)', phase: 'fundo', weight: 0.95 },
  ],
  promocional: [
    { kind: 'video', title: 'Teaser da oferta (gera curiosidade)', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'Revelação da promoção + condições', phase: 'meio', weight: 0.2 },
    { kind: 'video', title: 'Prova social — cliente aproveitando a oferta', phase: 'meio', weight: 0.45 },
    { kind: 'video', title: 'Quebra de objeção (preço, prazo, garantia)', phase: 'fundo', weight: 0.7 },
    { kind: 'video', title: 'Urgência — últimas horas / vagas', phase: 'fundo', weight: 0.95 },
  ],
  sazonal: [
    { kind: 'video', title: 'Contextualização da data (por que importa)', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'Sugestão de presente / kit temático', phase: 'meio', weight: 0.25 },
    { kind: 'video', title: 'Depoimento ligando marca + data', phase: 'meio', weight: 0.5 },
    { kind: 'video', title: 'Oferta especial da data + CTA', phase: 'fundo', weight: 0.75 },
    { kind: 'video', title: 'Última chance antes do fim da data', phase: 'fundo', weight: 0.95 },
  ],
  lancamento: [
    { kind: 'video', title: 'Provocação — problema que o produto resolve', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'Bastidor da criação (constrói expectativa)', phase: 'topo', weight: 0.12 },
    { kind: 'video', title: 'Contagem regressiva / save the date', phase: 'topo', weight: 0.28 },
    { kind: 'video', title: 'Revelação oficial do produto', phase: 'meio', weight: 0.45 },
    { kind: 'video', title: 'Demonstração / como funciona na prática', phase: 'meio', weight: 0.6 },
    { kind: 'video', title: 'Primeiros clientes / early adopters', phase: 'fundo', weight: 0.75 },
    { kind: 'video', title: 'Oferta de lançamento (bônus / preço especial)', phase: 'fundo', weight: 0.88 },
    { kind: 'video', title: 'Últimas unidades / fim do lote de lançamento', phase: 'fundo', weight: 0.98 },
  ],
  responsabilidade_social: [
    { kind: 'video', title: 'Apresentação da causa e por que a marca apoia', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'Bastidores da ação social (humanização)', phase: 'meio', weight: 0.35 },
    { kind: 'video', title: 'Impacto real — números e depoimentos', phase: 'meio', weight: 0.7 },
    { kind: 'video', title: 'Convite ao cliente (compra que apoia a causa)', phase: 'fundo', weight: 0.95 },
  ],
  evento: [
    { kind: 'video', title: 'Save the date — anúncio do evento', phase: 'topo', weight: 0.0 },
    { kind: 'video', title: 'Por que participar (dor + benefício)', phase: 'topo', weight: 0.15 },
    { kind: 'video', title: 'Convite do host / palestrante / atleta', phase: 'meio', weight: 0.3 },
    { kind: 'video', title: 'Prova social de edição anterior ou similar', phase: 'meio', weight: 0.5 },
    { kind: 'video', title: 'Últimas vagas / inscrições encerrando', phase: 'fundo', weight: 0.75 },
    { kind: 'video', title: 'Cobertura ao vivo — dia do evento', phase: 'fundo', weight: 0.9, notes: 'Postar durante o evento; usar para gerar FOMO em quem não foi.' },
    { kind: 'video', title: 'Pós-evento — oferta para a base de leads capturada', phase: 'pos', weight: 1.0, notes: 'Follow-up de vendas para os leads coletados.' },
  ],
};

/**
 * Templates de criativos (artes estáticas) por tipo. Complementam os vídeos.
 */
const CREATIVE_TEMPLATES: Record<CampaignType, SlotTemplate[]> = {
  institucional: [
    { kind: 'creative', title: 'Card manifesto — frase de posicionamento', phase: 'topo', weight: 0.1 },
    { kind: 'creative', title: 'Depoimento em card visual', phase: 'meio', weight: 0.5 },
    { kind: 'creative', title: 'Card CTA — fale com a gente', phase: 'fundo', weight: 0.9 },
  ],
  promocional: [
    { kind: 'creative', title: 'Card teaser — "vem aí"', phase: 'topo', weight: 0.05 },
    { kind: 'creative', title: 'Arte principal da oferta (preço/condição)', phase: 'meio', weight: 0.3 },
    { kind: 'creative', title: 'Depoimento visual de comprador', phase: 'meio', weight: 0.6 },
    { kind: 'creative', title: 'Contagem regressiva — últimas horas', phase: 'fundo', weight: 0.95 },
  ],
  sazonal: [
    { kind: 'creative', title: 'Card temático da data', phase: 'topo', weight: 0.1 },
    { kind: 'creative', title: 'Vitrine de produtos/serviços da data', phase: 'meio', weight: 0.5 },
    { kind: 'creative', title: 'Último dia — CTA final', phase: 'fundo', weight: 0.95 },
  ],
  lancamento: [
    { kind: 'creative', title: 'Teaser visual do produto (silhueta / detalhe)', phase: 'topo', weight: 0.1 },
    { kind: 'creative', title: 'Reveal — arte oficial do produto', phase: 'meio', weight: 0.45 },
    { kind: 'creative', title: 'Combo/bônus de lançamento', phase: 'fundo', weight: 0.75 },
    { kind: 'creative', title: 'Últimas unidades do lote', phase: 'fundo', weight: 0.98 },
  ],
  responsabilidade_social: [
    { kind: 'creative', title: 'Card apresentando a causa', phase: 'topo', weight: 0.1 },
    { kind: 'creative', title: 'Impacto em números', phase: 'meio', weight: 0.7 },
  ],
  evento: [
    { kind: 'creative', title: 'Save the date — arte principal', phase: 'topo', weight: 0.05 },
    { kind: 'creative', title: 'Programação / atrações', phase: 'meio', weight: 0.35 },
    { kind: 'creative', title: 'Últimas vagas — link de inscrição', phase: 'fundo', weight: 0.7 },
    { kind: 'creative', title: 'Pós-evento — obrigado + oferta', phase: 'pos', weight: 1.0 },
  ],
};

/**
 * Título e nota do editorial (briefing) de cada tipo de campanha.
 */
export const EDITORIAL_BRIEFINGS: Record<CampaignType, { title: string; notes: string }> = {
  institucional: {
    title: 'Editorial — Campanha Institucional',
    notes: 'Objetivo comercial: aquecer marca para conversões futuras.\nDefina: promessa central, prova, tom, hashtags, CTA soft (link do WhatsApp / site).',
  },
  promocional: {
    title: 'Editorial — Campanha Promocional',
    notes: 'Objetivo comercial: vender no curto prazo.\nDefina: oferta, condição, prazo, gatilhos de urgência, CTA direto (link para checkout / WhatsApp de venda).',
  },
  sazonal: {
    title: 'Editorial — Campanha Sazonal',
    notes: 'Objetivo comercial: capturar demanda existente da data.\nDefina: data-alvo, produtos priorizados, kit/combo temático, CTA de compra.',
  },
  lancamento: {
    title: 'Editorial — Campanha de Lançamento',
    notes: 'Objetivo comercial: vender o novo produto com pico no D-day.\nDefina: público prioritário, dores, benefício-chave, oferta de lançamento e prazo do lote.',
  },
  responsabilidade_social: {
    title: 'Editorial — Campanha de Responsabilidade Social',
    notes: 'Objetivo comercial: fortalecer marca e converter causa em venda.\nDefina: causa, parceiros, como a compra apoia a causa, CTA de compra atrelado.',
  },
  evento: {
    title: 'Editorial — Campanha de Evento (captura de leads)',
    notes: 'Objetivo comercial: capturar WhatsApp/e-mail para alimentar o funil e vender no pós-evento.\nDefina: data do evento, formulário de inscrição, meta de leads, oferta pós-evento e roteiro de follow-up.',
  },
};

/**
 * Distribui `count` slots usando um pool de templates, mantendo a ordem por `weight`.
 * Se count > templates, reutiliza os últimos (fundo de funil). Se count < templates, prioriza os mais estratégicos (mantendo topo + meio + fundo).
 */
function pickTemplates(pool: SlotTemplate[], count: number): SlotTemplate[] {
  if (count <= 0) return [];
  if (count === pool.length) return [...pool];
  if (count > pool.length) {
    const extras: SlotTemplate[] = [];
    for (let i = 0; i < count - pool.length; i++) {
      const base = pool[pool.length - 1 - (i % pool.length)];
      extras.push({ ...base, title: `${base.title} (reforço ${i + 1})`, weight: Math.min(0.99, base.weight + 0.02 * (i + 1)) });
    }
    return [...pool, ...extras].sort((a, b) => a.weight - b.weight);
  }
  // count < pool.length: pega os primeiros e o(s) último(s) para manter topo→fundo
  const step = (pool.length - 1) / (count - 1 || 1);
  const idx = new Set<number>();
  for (let i = 0; i < count; i++) idx.add(Math.round(i * step));
  return pool.filter((_, i) => idx.has(i));
}

function dateFromWeight(start: string, end: string, weight: number): string {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T00:00:00').getTime();
  const t = s + (e - s) * Math.max(0, Math.min(1, weight));
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Gera todos os slots (editorial + vídeos + criativos) de uma campanha, prontos para insert.
 */
export function buildCampaignSlots(params: {
  type: CampaignType;
  startDate: string;
  endDate: string;
  videosQty: number;
  creativesQty: number;
}): GeneratedSlot[] {
  const { type, startDate, endDate, videosQty, creativesQty } = params;
  const editorial = EDITORIAL_BRIEFINGS[type];

  const videos = pickTemplates(VIDEO_TEMPLATES[type], videosQty);
  const creatives = pickTemplates(CREATIVE_TEMPLATES[type], creativesQty);

  const slots: GeneratedSlot[] = [];
  let position = 0;

  slots.push({
    position: position++,
    kind: 'editorial',
    title: editorial.title,
    post_date: startDate,
    status: 'pendente',
    notes: editorial.notes,
  });

  // Se pool tem tamanho igual a videosQty, respeita weight; se recalculado, fallback distribute
  const useWeights = videos.length > 0;
  const fallbackVideoDates = distributeDates(startDate, endDate, videosQty);
  videos.forEach((tpl, i) => {
    slots.push({
      position: position++,
      kind: 'video',
      title: tpl.title,
      post_date: useWeights ? dateFromWeight(startDate, endDate, tpl.weight) : fallbackVideoDates[i],
      status: 'pendente',
      notes: tpl.notes || `Fase do funil: ${tpl.phase.toUpperCase()}`,
    });
  });

  const fallbackCreativeDates = distributeDates(startDate, endDate, creativesQty);
  creatives.forEach((tpl, i) => {
    slots.push({
      position: position++,
      kind: 'creative',
      title: tpl.title,
      post_date: creatives.length > 0 ? dateFromWeight(startDate, endDate, tpl.weight) : fallbackCreativeDates[i],
      status: 'pendente',
      notes: `Fase do funil: ${tpl.phase.toUpperCase()}`,
    });
  });

  return slots;
}

/**
 * Preview leve (sem gravar) para mostrar no wizard.
 */
export function previewCampaignSlots(params: Parameters<typeof buildCampaignSlots>[0]) {
  return buildCampaignSlots(params);
}

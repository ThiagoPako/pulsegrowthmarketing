// Temperatura do cliente — contas puras (sem banco): nota de dados, nota da conversa, nota final, faixa,
// tendência e regra dos alertas. Usado pelo servidor (temperature.mjs) e pelos testes (src/test).
//
// ── Como a nota sai ─────────────────────────────────────────────────────────────────────────────
// Nota de dados (0–100): começa em 100 e perde pontos por sinal dos últimos 30 dias (teto entre parênteses):
//   atrasos de entrega .................. 6 por item com prazo estourado (até 24)
//   pedidos de ajuste do cliente ........ (ajustes ÷ entregas) × 25, a partir de 2 ajustes (até 15)
//   devolvidos 2+ vezes ................. 5 por item (até 10)
//   tempo para aprovar (mediana) ........ acima de 72 h: 4; acima de 168 h: 8
//   esperando aprovação há 7+ dias ...... 2 por item (até 6)
//   gravações canceladas/remarcadas ..... 5 por vez (até 15)
//   entregas do plano no mês ............ abaixo de 75% do previsto até hoje: 6; abaixo de 50%: 12
//   inadimplência ....................... vencida há 8+ dias: 6; há 30+ dias ou 2+ parcelas: 12
//   portal sem acesso em 30 dias ........ 4 (só com entregas enviadas no período e 30+ dias de registro)
//   resposta da equipe no grupo ......... mediana acima de 8 h: 3; acima de 24 h: 6 (com 3+ conversas medidas)
//   cliente sem escrever no grupo ....... 21+ dias: 6
//   piora contra os 30 dias anteriores .. +3 em atrasos, ajustes e gravações quando dobrou (e chegou a 2+)
// Nota da conversa (0–100): média das leituras do grupo dos últimos 7 dias, pesada pelo número de mensagens e
//   pela idade (cada dia vale 15% menos). Sem leitura no período: fica de fora.
// Nota final: 60% conversa + 40% dados (sem conversa, só os dados). Ameaça de cancelar nos últimos 7 dias
//   limita a nota a 35. Faixas: Satisfeito ≥ 70, Atenção 40–69, Insatisfeito < 40.

export const BANDS = {
  satisfeito: { label: 'Satisfeito', min: 70 },
  atencao: { label: 'Atenção', min: 40 },
  insatisfeito: { label: 'Insatisfeito', min: 0 },
};

export const WEIGHTS = {
  conversa: 0.6,
  dados: 0.4,
  tetoAmeaca: 35,
  atrasoPorItem: 6, atrasoTeto: 24,
  ajusteFator: 25, ajusteTeto: 15, ajusteMinimo: 2,
  devolvidoPorItem: 5, devolvidoTeto: 10,
  aprovacaoLenta: 4, aprovacaoMuitoLenta: 8,
  esperandoPorItem: 2, esperandoTeto: 6,
  gravacaoPorVez: 5, gravacaoTeto: 15,
  entregasAbaixo75: 6, entregasAbaixo50: 12,
  inadimplencia8: 6, inadimplencia30: 12,
  portalSemAcesso: 4,
  respostaLenta: 3, respostaMuitoLenta: 6,
  silencioGrupo: 6, silencioDias: 21,
  piora: 3,
  decaimentoDiario: 0.85,
};

/** Quedas fortes e repetição dos alertas. */
export const ALERT_RULES = {
  quedaSemana: -20,
  repetirAposDias: 3,
  pioraMinima: 10,
  conversaInsatisfeita: 30,
};

export const SIGNALS = {
  atraso: 'atraso',
  qualidade: 'qualidade',
  preco: 'preço',
  atendimento: 'atendimento',
  sumico: 'sumiço',
  ameaca_cancelar: 'ameaça de cancelar',
};

export const ALERT_REASONS = {
  faixa_vermelha: 'Insatisfeito',
  queda: 'Queda forte na semana',
  ameaca_cancelar: 'Ameaça de cancelar',
  insatisfacao_grupo: 'Insatisfação no grupo',
};

const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round = (n) => Math.round(Number(n) || 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const before = (atual, anterior) => (Number.isFinite(anterior) && anterior !== atual ? ` (antes ${anterior})` : '');
const hoursLabel = (h) => (h >= 48 ? `${Math.round(h / 24)} dias` : `${Math.round(h)} h`);

export function bandOf(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
  const n = Number(score);
  if (n >= BANDS.satisfeito.min) return 'satisfeito';
  if (n >= BANDS.atencao.min) return 'atencao';
  return 'insatisfeito';
}

const worsened = (atual, anterior) => Number.isFinite(atual) && Number.isFinite(anterior) && atual >= 2 && atual >= anterior * 2;

/**
 * Nota de dados a partir dos sinais (cada sinal pode faltar: null = sem dado, não pesa).
 * Devolve { score, motivos: [{ chave, texto, pontos }] } com os motivos do maior para o menor peso.
 */
export function dataScore(s = {}) {
  const motivos = [];
  const add = (chave, pontos, texto) => {
    if (pontos > 0) motivos.push({ chave, pontos: round(pontos), texto });
  };

  if (s.atrasos) {
    const { atual = 0, anterior } = s.atrasos;
    if (atual > 0) {
      add('atrasos', Math.min(WEIGHTS.atrasoTeto, atual * WEIGHTS.atrasoPorItem) + (worsened(atual, anterior) ? WEIGHTS.piora : 0),
        `${plural(atual, 'entrega atrasada', 'entregas atrasadas')}${before(atual, anterior)}`);
    }
  }
  if (s.ajustes) {
    const { atual = 0, anterior, entregas = 0 } = s.ajustes;
    if (atual >= WEIGHTS.ajusteMinimo) {
      const ratio = atual / Math.max(1, entregas);
      add('ajustes', Math.min(WEIGHTS.ajusteTeto, ratio * WEIGHTS.ajusteFator) + (worsened(atual, anterior) ? WEIGHTS.piora : 0),
        `${plural(atual, 'pedido de ajuste', 'pedidos de ajuste')} em ${plural(entregas, 'entrega', 'entregas')}${before(atual, anterior)}`);
    }
  }
  if (s.devolvidos?.atual > 0) {
    const n = s.devolvidos.atual;
    add('devolvidos', Math.min(WEIGHTS.devolvidoTeto, n * WEIGHTS.devolvidoPorItem),
      `${plural(n, 'conteúdo devolvido', 'conteúdos devolvidos')} mais de uma vez`);
  }
  if (s.aprovacao) {
    const { horas, anterior, esperando = 0 } = s.aprovacao;
    if (Number.isFinite(horas) && horas > 72) {
      add('aprovacao', horas > 168 ? WEIGHTS.aprovacaoMuitoLenta : WEIGHTS.aprovacaoLenta,
        `Leva ${hoursLabel(horas)} para aprovar${Number.isFinite(anterior) ? ` (antes ${hoursLabel(anterior)})` : ''}`);
    }
    if (esperando > 0) {
      add('esperando', Math.min(WEIGHTS.esperandoTeto, esperando * WEIGHTS.esperandoPorItem),
        `${plural(esperando, 'item esperando', 'itens esperando')} aprovação há mais de 7 dias`);
    }
  }
  if (s.gravacoes) {
    const { atual = 0, anterior } = s.gravacoes;
    if (atual > 0) {
      add('gravacoes', Math.min(WEIGHTS.gravacaoTeto, atual * WEIGHTS.gravacaoPorVez) + (worsened(atual, anterior) ? WEIGHTS.piora : 0),
        `${plural(atual, 'gravação cancelada ou remarcada', 'gravações canceladas ou remarcadas')}${before(atual, anterior)}`);
    }
  }
  if (s.entregas && s.entregas.avaliar && s.entregas.previsto > 0) {
    const { feitas = 0, previsto, contratado, referencia } = s.entregas;
    const ratio = feitas / previsto;
    if (ratio < 0.75) {
      add('entregas', ratio < 0.5 ? WEIGHTS.entregasAbaixo50 : WEIGHTS.entregasAbaixo75,
        `Entregas ${referencia === 'mes_anterior' ? 'do mês passado' : 'do mês'}: ${feitas} de ${round(previsto)}${contratado && round(contratado) !== round(previsto) ? ` previstas até hoje (${round(contratado)} no mês)` : ' contratadas'}`);
    }
  }
  if (s.inadimplencia?.parcelas > 0) {
    // sem valor no texto: o motivo aparece para toda a gestão e no aviso; o valor fica no detalhe, só para quem vê o financeiro
    const { parcelas, maxDias = 0 } = s.inadimplencia;
    const pts = maxDias >= 30 || parcelas >= 2 ? WEIGHTS.inadimplencia30 : maxDias >= 8 ? WEIGHTS.inadimplencia8 : 0;
    add('inadimplencia', pts, `Pagamento vencido há ${plural(maxDias, 'dia', 'dias')}${parcelas > 1 ? ` (${parcelas} parcelas)` : ''}`);
  }
  if (s.portal && s.portal.avaliar && s.portal.diasComAcesso === 0 && (s.portal.entregasEnviadas || 0) > 0) {
    add('portal', WEIGHTS.portalSemAcesso, 'Sem acessar o portal em 30 dias');
  }
  if (s.respostaEquipe && (s.respostaEquipe.conversas || 0) >= 3 && Number.isFinite(s.respostaEquipe.medianaHoras)) {
    const h = s.respostaEquipe.medianaHoras;
    if (h > 8) add('resposta_equipe', h > 24 ? WEIGHTS.respostaMuitoLenta : WEIGHTS.respostaLenta, `Equipe leva ${hoursLabel(h)} para responder no grupo`);
  }
  if (s.silencio && s.silencio.observado && Number.isFinite(s.silencio.dias) && s.silencio.dias >= WEIGHTS.silencioDias) {
    add('silencio', WEIGHTS.silencioGrupo, `Sem escrever no grupo há ${s.silencio.dias >= 30 ? 'mais de 30' : s.silencio.dias} dias`);
  }

  motivos.sort((a, b) => b.pontos - a.pontos);
  const lost = motivos.reduce((sum, m) => sum + m.pontos, 0);
  return { score: clamp(100 - lost), motivos };
}

/**
 * Texto normalizado para comparar trechos (minúsculo, sem acento, sem aspas, espaços simples) e, para cada letra
 * dele, a posição no texto original (para devolver o trecho como o cliente escreveu).
 */
function normalizeWithMap(text) {
  const source = String(text || '');
  let out = '';
  const map = [];
  let space = true;
  for (let i = 0; i < source.length; i++) {
    let c = source[i].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/[“”"«»'‘’`]/.test(c)) continue;
    if (/\s/.test(c)) {
      if (space) continue;
      c = ' ';
      space = true;
    } else space = false;
    for (const ch of c) {
      out += ch;
      map.push(i);
    }
  }
  while (out.endsWith(' ')) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { out, map, source };
}

export const normText = (text) => normalizeWithMap(text).out;

/** Tira números de telefone (8+ dígitos, com ou sem separadores) de um texto que vai para a tela ou para o aviso. */
export const maskPhones = (text) => String(text || '').replace(/[+(]?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, '').length >= 8 ? '•••' : m));

const cleanLine = (text, max) => maskPhones(String(text || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max);

/**
 * Trechos de evidência: só os que aparecem nas mensagens do cliente (o modelo não inventa nem cita a equipe),
 * devolvidos como o cliente escreveu, até 2, até 140 caracteres, sem telefone.
 */
export function cleanExcerpts(excerpts, clientTexts) {
  const corpus = (clientTexts || []).map(normalizeWithMap);
  const out = [];
  for (const raw of Array.isArray(excerpts) ? excerpts : []) {
    const key = normText(String(raw || '').replace(/^[\s"'“”.…]+|[\s"'“”.…]+$/g, ''));
    if (key.length < 3) continue;
    let original = null;
    for (const t of corpus) {
      const at = t.out.indexOf(key);
      if (at >= 0) {
        original = t.source.slice(t.map[at], t.map[at + key.length - 1] + 1);
        break;
      }
    }
    if (!original) continue;
    const text = cleanLine(original, 140);
    if (text && !out.includes(text)) out.push(text);
    if (out.length === 2) break;
  }
  return out;
}

/** Saída do classificador → leitura validada (nota 0–100, sinais conhecidos, trechos conferidos, resumo curto). */
export function parseReading(data, clientTexts) {
  if (!data || typeof data !== 'object') return null;
  const nota = Number(data.nota);
  if (!Number.isFinite(nota)) return null;
  const sinais = [...new Set((Array.isArray(data.sinais) ? data.sinais : []).map(String))].filter((k) => SIGNALS[k]);
  return {
    nota: clamp(round(nota)),
    sinais,
    trechos: cleanExcerpts(data.trechos, clientTexts),
    resumo: cleanLine(data.resumo, 200),
  };
}

const DAY = 86_400_000;

/**
 * Nota da conversa: leituras dos últimos 7 dias ({ nota, mensagens, sinais, trechos, resumo, created_at }).
 * Devolve null sem leitura; senão { score, sinais, trechos, ameaca, resumo, leituras }.
 */
export function conversationScore(readings, now = new Date()) {
  const recent = (readings || []).filter((r) => Number.isFinite(Number(r.nota)) && now - new Date(r.created_at) <= 7 * DAY);
  if (!recent.length) return null;
  let sum = 0;
  let weight = 0;
  for (const r of recent) {
    const ageDays = Math.max(0, (now - new Date(r.created_at)) / DAY);
    const w = Math.max(1, Number(r.mensagens) || 1) * WEIGHTS.decaimentoDiario ** ageDays;
    sum += Number(r.nota) * w;
    weight += w;
  }
  const unhappy = recent.filter((r) => (r.sinais || []).length);
  const sinais = [...new Set(unhappy.flatMap((r) => r.sinais))].filter((k) => SIGNALS[k]);
  // evidência: das leituras mais insatisfeitas, as mais recentes primeiro
  const trechos = [...unhappy]
    .sort((a, b) => Number(a.nota) - Number(b.nota) || new Date(b.created_at) - new Date(a.created_at))
    .flatMap((r) => r.trechos || []).filter((t, i, all) => all.indexOf(t) === i).slice(0, 2);
  const latest = [...recent].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return {
    score: clamp(round(sum / weight)),
    sinais,
    trechos,
    ameaca: sinais.includes('ameaca_cancelar'),
    resumo: latest?.resumo || '',
    leituras: recent.length,
  };
}

/** Motivo de conversa (entra na lista junto com os de dados). */
export function conversationReason(conv) {
  if (!conv) return null;
  if (conv.ameaca) return { chave: 'ameaca_cancelar', pontos: 100, texto: 'Falou em cancelar no grupo' };
  if (conv.score < 60 && conv.sinais.length) {
    const labels = conv.sinais.filter((k) => k !== 'ameaca_cancelar').map((k) => SIGNALS[k]);
    return { chave: 'conversa', pontos: round((60 - conv.score) * WEIGHTS.conversa), texto: `Insatisfação no grupo: ${labels.join(', ')}` };
  }
  if (conv.score < 50) return { chave: 'conversa', pontos: round((60 - conv.score) * WEIGHTS.conversa), texto: 'Tom negativo no grupo' };
  return null;
}

/**
 * Nota final, faixa e motivos. data = dataScore(...), conv = conversationScore(...) ou null.
 * Sem nenhum motivo negativo, o motivo é o positivo (conversa boa) ou "Sem sinais de insatisfação".
 */
export function combineScore(data, conv) {
  let score = conv ? round(WEIGHTS.conversa * conv.score + WEIGHTS.dados * data.score) : data.score;
  if (conv?.ameaca) score = Math.min(score, WEIGHTS.tetoAmeaca);
  score = clamp(score);
  const motivos = [...data.motivos];
  const reason = conversationReason(conv);
  if (reason) motivos.push(reason);
  motivos.sort((a, b) => b.pontos - a.pontos);
  if (!motivos.length) {
    motivos.push(conv && conv.score >= 75
      ? { chave: 'positivo', pontos: 0, texto: 'Satisfeito no grupo' }
      : { chave: 'neutro', pontos: 0, texto: 'Sem sinais de insatisfação' });
  }
  return { score, faixa: bandOf(score), motivos, trechos: conv?.trechos || [] };
}

/** Variação contra a nota de uma semana antes (null sem histórico). */
export const trendOf = (score, weekAgo) => (Number.isFinite(score) && Number.isFinite(weekAgo) ? round(score - weekAgo) : null);

/**
 * Motivos de alerta desta análise:
 *   faixa_vermelha (nota < 40), queda (−20 ou mais na semana), ameaca_cancelar / insatisfacao_grupo (leitura do
 *   grupo dos últimos 3 dias com ameaça, ou com nota ≤ 30 e sinal de insatisfação, ainda sem alerta depois dela).
 * freshReadings: leituras ainda não alertadas (created_at depois do último alerta daquele motivo).
 */
export function alertTriggers({ score, variacao, freshThreat, freshUnhappy }) {
  const out = [];
  if (Number.isFinite(score) && score < BANDS.atencao.min) out.push('faixa_vermelha');
  if (Number.isFinite(variacao) && variacao <= ALERT_RULES.quedaSemana) out.push('queda');
  if (freshThreat) out.push('ameaca_cancelar');
  if (freshUnhappy) out.push('insatisfacao_grupo');
  return out;
}

/** Sem repetir: um alerta por cliente e motivo a cada 3 dias, salvo piora (nota 10+ pontos abaixo da do último). */
export function shouldAlert(last, score, now = new Date()) {
  if (!last) return true;
  const age = now - new Date(last.created_at);
  if (age >= ALERT_RULES.repetirAposDias * DAY) return true;
  return Number.isFinite(score) && Number.isFinite(Number(last.nota)) && score <= Number(last.nota) - ALERT_RULES.pioraMinima;
}

/** Mensagem curta do aviso: cliente, temperatura, motivo principal e trecho. */
export function alertMessage({ cliente, cidade, score, faixa, variacao, motivo, trecho }) {
  const lines = [
    `🌡️ *Temperatura de ${cliente}*${cidade ? ` (${cidade})` : ''}`,
    `${score}/100 · ${BANDS[faixa]?.label || ''}${Number.isFinite(variacao) && variacao < 0 ? ` (${variacao} na semana)` : ''}`,
    `Motivo: ${motivo}`,
  ];
  if (trecho) lines.push(`💬 "${trecho}"`);
  return lines.join('\n');
}

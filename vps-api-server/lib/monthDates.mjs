// ─── Datas do mês que combinam com o nicho do cliente (relatório do dia 1; pedido do usuário, 01/11/2026) ──────
// "Entenda o nicho do cliente e fale das datas importantes do mês e o que podemos trabalhar": o PDF do relatório leva,
// em "Sugestões para <mês>", até 3 datas do mês que começa, cada uma com a ideia do que a Pulse pode fazer.
// Espelho de src/lib/artSuggestions.ts (HOLIDAY_RULES e SEASONAL_RULES, os mesmos nichos): mudou um, mude o outro.
// Nada de promoção ou preço: a ideia é o tipo de conteúdo; a oferta, se houver, é o cliente quem define.

const at = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const pad = (n) => String(n).padStart(2, '0');

/** Domingo de Páscoa (Meeus/Jones/Butcher). */
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return at(year, month, day);
}
const nthWeekday = (year, month, weekday, n) => {
  const first = at(year, month, 1);
  return at(year, month, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
};
const lastWeekday = (year, month, weekday) => {
  const last = at(year, month + 1, 0);
  return addDays(last, -((last.getUTCDay() - weekday + 7) % 7));
};

const SAUDE = ['saude', 'farmacia', 'odontologia', 'emagrecimento', 'fitness', 'beleza', 'otica', 'clinica_veterinaria'];
const VAREJO = ['varejo', 'moda', 'mercado', 'joalheria', 'otica', 'moveis', 'infantil', 'construcao', 'veiculos', 'grafica', 'limpeza', 'pet', 'tecnologia'];
const COMIDA = ['alimentacao', 'confeitaria', 'mercado'];

// idea: o que a Pulse pode fazer na data (curta, para o PDF)
const HOLIDAYS = [
  { label: 'Confraternização Universal', date: (y) => at(y, 1, 1), idea: 'arte de Ano Novo com o horário de funcionamento' },
  { label: 'Carnaval', date: (y) => addDays(easter(y), -48), idea: 'aviso de funcionamento nos dias de Carnaval' },
  { label: 'Sexta-feira Santa', date: (y) => addDays(easter(y), -2), idea: 'aviso de funcionamento na Sexta-feira Santa' },
  { label: 'Tiradentes', date: (y) => at(y, 4, 21), idea: 'aviso de funcionamento no feriado' },
  { label: 'Dia do Trabalhador', date: (y) => at(y, 5, 1), idea: 'homenagem à equipe e aviso de funcionamento' },
  { label: 'Corpus Christi', date: (y) => addDays(easter(y), 60), idea: 'aviso de funcionamento no feriado' },
  { label: 'Independência do Brasil', date: (y) => at(y, 9, 7), idea: 'aviso de funcionamento no 7 de Setembro' },
  { label: 'Nossa Senhora Aparecida', date: (y) => at(y, 10, 12), idea: 'aviso de funcionamento no feriado' },
  { label: 'Finados', date: (y) => at(y, 11, 2), idea: 'aviso de funcionamento em tom respeitoso' },
  { label: 'Proclamação da República', date: (y) => at(y, 11, 15), idea: 'aviso de funcionamento no feriado' },
  { label: 'Consciência Negra', date: (y) => at(y, 11, 20), idea: 'aviso de funcionamento e conteúdo sobre a data' },
  { label: 'Natal', date: (y) => at(y, 12, 25), idea: 'mensagem de Natal e horário especial de fim de ano' },
  { label: 'Réveillon', date: (y) => at(y, 12, 31), idea: 'mensagem de Ano Novo e horário do dia 31' },
];

const SEASONAL = [
  { label: 'Dia do Farmacêutico', date: (y) => at(y, 1, 20), niches: ['farmacia'], idea: 'homenagem aos farmacêuticos da equipe' },
  { label: 'Dia da Mulher', date: (y) => at(y, 3, 8), idea: 'homenagem às mulheres, clientes e equipe' },
  { label: 'Dia do Consumidor', date: (y) => at(y, 3, 15), niches: VAREJO, idea: 'agradecimento aos clientes' },
  { label: 'Páscoa', date: (y) => easter(y), niches: [...COMIDA, 'varejo', 'infantil'], idea: 'campanha de Páscoa com os produtos da casa' },
  { label: 'Dia das Mães', date: (y) => nthWeekday(y, 5, 0, 2), niches: [...VAREJO, ...COMIDA, 'beleza', 'barbearia', 'turismo', 'saude', 'farmacia'], idea: 'campanha emocional com histórias de mães' },
  { label: 'Dia dos Namorados', date: (y) => at(y, 6, 12), niches: [...VAREJO, ...COMIDA, 'beleza', 'barbearia', 'turismo'], idea: 'campanha de presente e experiência a dois' },
  { label: 'Festa Junina', date: (y) => at(y, 6, 24), niches: [...COMIDA, 'agropecuaria', 'varejo', 'educacao'], idea: 'conteúdo de arraiá com produtos ou evento' },
  { label: 'Dia do Motorista', date: (y) => at(y, 7, 25), niches: ['automotivo', 'veiculos'], idea: 'homenagem aos motoristas e dica de cuidado com o veículo' },
  { label: 'Dia do Agricultor', date: (y) => at(y, 7, 28), niches: ['agropecuaria'], idea: 'homenagem ao produtor rural com clientes reais' },
  { label: 'Dia dos Pais', date: (y) => nthWeekday(y, 8, 0, 2), niches: [...VAREJO, ...COMIDA, 'barbearia', 'automotivo', 'turismo'], idea: 'campanha de presente para os pais' },
  { label: 'Dia do Advogado', date: (y) => at(y, 8, 11), niches: ['juridico'], idea: 'homenagem à advocacia' },
  { label: 'Dia do Corretor de Imóveis', date: (y) => at(y, 8, 27), niches: ['imoveis'], idea: 'homenagem aos corretores' },
  { label: 'Dia do Nutricionista', date: (y) => at(y, 8, 31), niches: ['emagrecimento', 'saude', 'fitness'], idea: 'homenagem e dica de alimentação' },
  { label: 'Setembro Amarelo', date: (y) => at(y, 9, 1), niches: SAUDE, idea: 'conscientização sobre saúde mental, em tom cuidadoso' },
  { label: 'Dia do Médico Veterinário', date: (y) => at(y, 9, 9), niches: ['pet', 'clinica_veterinaria', 'agropecuaria'], idea: 'homenagem aos veterinários' },
  { label: 'Dia do Cliente', date: (y) => at(y, 9, 15), idea: 'agradecimento aos clientes, com depoimentos' },
  { label: 'Dia do Contador', date: (y) => at(y, 9, 22), niches: ['contabilidade'], idea: 'homenagem aos contadores' },
  { label: 'Outubro Rosa', date: (y) => at(y, 10, 1), niches: [...SAUDE, 'beleza', 'moda'], idea: 'conscientização sobre o câncer de mama' },
  { label: 'Dia das Crianças', date: (y) => at(y, 10, 12), niches: ['infantil', 'varejo', 'moda', ...COMIDA, 'educacao', 'odontologia'], idea: 'campanha do Dia das Crianças' },
  { label: 'Dia do Professor', date: (y) => at(y, 10, 15), niches: ['educacao'], idea: 'homenagem aos professores' },
  { label: 'Dia do Médico', date: (y) => at(y, 10, 18), niches: ['saude'], idea: 'homenagem aos médicos da equipe' },
  { label: 'Dia do Dentista', date: (y) => at(y, 10, 25), niches: ['odontologia'], idea: 'homenagem aos dentistas' },
  { label: 'Novembro Azul', date: (y) => at(y, 11, 1), niches: [...SAUDE, 'barbearia'], idea: 'série sobre a saúde do homem e a prevenção' },
  { label: 'Black Friday', date: (y) => lastWeekday(y, 11, 5), niches: VAREJO, idea: 'aquecimento e divulgação das ofertas que vocês definirem' },
  // mais datas por nicho (usuário, 01/11/2026: "organizado de acordo com o nicho")
  { label: 'Dia Mundial da Saúde', date: (y) => at(y, 4, 7), niches: SAUDE, idea: 'conteúdo sobre cuidado com a saúde' },
  { label: 'Dia da Enfermagem', date: (y) => at(y, 5, 12), niches: ['saude'], idea: 'homenagem à equipe de enfermagem' },
  { label: 'Dia do Trabalhador Rural', date: (y) => at(y, 5, 25), niches: ['agropecuaria'], idea: 'homenagem a quem trabalha no campo' },
  { label: 'Dia do Meio Ambiente', date: (y) => at(y, 6, 5), niches: ['agropecuaria'], idea: 'conteúdo sobre cuidado com a terra e a produção' },
  { label: 'Dia do Comerciante', date: (y) => at(y, 7, 16), niches: [...VAREJO, ...COMIDA, 'automotivo'], idea: 'homenagem aos comerciantes e à equipe da loja' },
  { label: 'Dia do Estudante', date: (y) => at(y, 8, 11), niches: ['educacao'], idea: 'homenagem aos alunos' },
  { label: 'Dia do Psicólogo', date: (y) => at(y, 8, 27), niches: ['saude'], idea: 'homenagem aos psicólogos' },
  { label: 'Dia do Profissional de Educação Física', date: (y) => at(y, 9, 1), niches: ['fitness'], idea: 'homenagem aos professores de educação física' },
  { label: 'Dia da Árvore', date: (y) => at(y, 9, 21), niches: ['agropecuaria'], idea: 'conteúdo sobre a natureza e o campo' },
  { label: 'Dia dos Animais', date: (y) => at(y, 10, 4), niches: ['pet', 'clinica_veterinaria'], idea: 'homenagem aos pets dos clientes' },
  { label: 'Dia do Engenheiro Agrônomo', date: (y) => at(y, 10, 12), niches: ['agropecuaria'], idea: 'homenagem aos agrônomos' },
  { label: 'Dia do Fisioterapeuta', date: (y) => at(y, 10, 13), niches: ['saude', 'fitness'], idea: 'homenagem aos fisioterapeutas' },
  { label: 'Dia Mundial da Alimentação', date: (y) => at(y, 10, 16), niches: [...COMIDA, 'emagrecimento'], idea: 'conteúdo sobre boa alimentação' },
  { label: 'Dia do Arquiteto', date: (y) => at(y, 12, 15), niches: ['construcao', 'imoveis'], idea: 'homenagem aos arquitetos' },
  { label: 'Dia do Mecânico', date: (y) => at(y, 12, 20), niches: ['automotivo'], idea: 'homenagem aos mecânicos da equipe' },
  { label: 'Campanha de Natal', date: (y) => at(y, 12, 1), idea: 'campanha e mensagem de fim de ano' },
];

/**
 * Até `limit` datas do mês ("2026-11") que combinam com o nicho: primeiro as do nicho (e as que valem para todos),
 * depois os feriados; em ordem de data. Cada uma: { date: '2026-11-20', day: '20/11', label, idea }.
 */
export function monthDates(month, niche, { limit = 3 } = {}) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return [];
  const n = String(niche || '').trim().toLowerCase();
  const inMonth = (rule) => {
    const d = rule.date(y);
    return d.getUTCMonth() + 1 === m ? d : null;
  };
  const pick = (rules, seasonal) => rules
    .map((r) => ({ r, d: inMonth(r) }))
    .filter(({ r, d }) => d && (!seasonal || !r.niches || (n && r.niches.includes(n))))
    .map(({ r, d }) => ({ date: `${y}-${pad(m)}-${pad(d.getUTCDate())}`, day: `${pad(d.getUTCDate())}/${pad(m)}`, label: r.label, idea: r.idea, kind: seasonal ? 'sazonal' : 'feriado' }));
  // datas do nicho primeiro; feriado só completa a lista
  return [...pick(SEASONAL, true), ...pick(HOLIDAYS, false)].slice(0, limit).sort((a, b) => a.date.localeCompare(b.date));
}

/** Todas as datas do mês para o calendário editorial: feriados (arte de aviso) e as datas do nicho. */
export function monthCalendar(month, niche) {
  return monthDates(month, niche, { limit: Infinity });
}

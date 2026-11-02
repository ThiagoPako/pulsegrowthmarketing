/**
 * Ísis, a social media da agência (agente criada em 01/11/2026): sugere no Kanban de Design as artes que precisam ser
 * feitas — avisos de feriado (fechado / "estaremos abertos") e datas sazonais do nicho de cada cliente.
 * Pedido do usuário: "dessa vez deixamos passar em branco as artes de aviso de feriado (Finados)… quero que o sistema
 * sugira no Kanban de Designers as artes que precisam ser feitas; seleciono os clientes, quem vai estar aberto, e as
 * sazonais do nicho também aparecem e eu escolho as que são para fazer."
 * Tudo calculado aqui (sem serviço externo): feriados nacionais (com os móveis da Páscoa) e um calendário por nicho.
 */

export type ArtSuggestionKind = 'feriado' | 'sazonal';

export interface ArtSuggestion {
  /** id estável por data (ex.: "feriado:finados:2026") — usado para não sugerir de novo o que já virou card */
  id: string;
  kind: ArtSuggestionKind;
  label: string;
  /** YYYY-MM-DD */
  date: string;
  daysUntil: number;
  /** nichos que combinam (vazio = todos os clientes) */
  niches: string[];
  /** o que a arte comunica (vai na descrição do card) */
  suggestion: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): Date {
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

/** n-ésimo dia da semana do mês (weekday: 0 = domingo). */
const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  const first = at(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return at(year, month, 1 + offset + (n - 1) * 7);
};
const lastWeekday = (year: number, month: number, weekday: number) => {
  const last = at(year, month + 1, 0);
  return addDays(last, -((last.getDay() - weekday + 7) % 7));
};

type Rule = { slug: string; label: string; date: (y: number) => Date; niches?: string[]; suggestion: string };

const SAUDE = ['saude', 'farmacia', 'odontologia', 'emagrecimento', 'fitness', 'beleza', 'otica', 'clinica_veterinaria'];
const VAREJO = ['varejo', 'moda', 'mercado', 'joalheria', 'otica', 'moveis', 'infantil', 'construcao', 'veiculos', 'grafica', 'limpeza', 'pet', 'tecnologia'];
const COMIDA = ['alimentacao', 'confeitaria', 'mercado'];

/** Feriados nacionais (lei federal) e os pontos facultativos que fecham o comércio na prática. */
export const HOLIDAY_RULES: Rule[] = [
  { slug: 'confraternizacao', label: 'Confraternização Universal (Ano Novo)', date: (y) => at(y, 1, 1), suggestion: 'Aviso de funcionamento no 1º de janeiro e mensagem de Ano Novo.' },
  { slug: 'carnaval', label: 'Carnaval', date: (y) => addDays(easter(y), -48), suggestion: 'Aviso de funcionamento na segunda e terça de Carnaval (ponto facultativo).' },
  { slug: 'sexta-santa', label: 'Sexta-feira Santa', date: (y) => addDays(easter(y), -2), suggestion: 'Aviso de funcionamento na Sexta-feira Santa.' },
  { slug: 'tiradentes', label: 'Tiradentes', date: (y) => at(y, 4, 21), suggestion: 'Aviso de funcionamento no feriado de Tiradentes.' },
  { slug: 'trabalho', label: 'Dia do Trabalhador', date: (y) => at(y, 5, 1), suggestion: 'Aviso de funcionamento no 1º de maio (pode homenagear a equipe).' },
  { slug: 'corpus-christi', label: 'Corpus Christi', date: (y) => addDays(easter(y), 60), suggestion: 'Aviso de funcionamento em Corpus Christi (ponto facultativo).' },
  { slug: 'independencia', label: 'Independência do Brasil', date: (y) => at(y, 9, 7), suggestion: 'Aviso de funcionamento no 7 de Setembro.' },
  { slug: 'aparecida', label: 'Nossa Senhora Aparecida', date: (y) => at(y, 10, 12), suggestion: 'Aviso de funcionamento no feriado de 12 de outubro.' },
  { slug: 'finados', label: 'Finados', date: (y) => at(y, 11, 2), suggestion: 'Aviso de funcionamento em Finados, com tom respeitoso (sem oferta).' },
  { slug: 'republica', label: 'Proclamação da República', date: (y) => at(y, 11, 15), suggestion: 'Aviso de funcionamento no 15 de novembro.' },
  { slug: 'consciencia-negra', label: 'Dia da Consciência Negra', date: (y) => at(y, 11, 20), suggestion: 'Aviso de funcionamento no 20 de novembro (feriado nacional desde 2024).' },
  { slug: 'natal', label: 'Natal', date: (y) => at(y, 12, 25), suggestion: 'Horário especial de fim de ano: véspera (24/12) e Natal.' },
  { slug: 'reveillon', label: 'Réveillon', date: (y) => at(y, 12, 31), suggestion: 'Horário especial no dia 31 de dezembro.' },
];

/** Datas comemorativas por nicho (campanha, homenagem ou conscientização). */
export const SEASONAL_RULES: Rule[] = [
  { slug: 'dia-farmaceutico', label: 'Dia do Farmacêutico', date: (y) => at(y, 1, 20), niches: ['farmacia'], suggestion: 'Homenagem aos farmacêuticos da equipe.' },
  { slug: 'dia-mulher', label: 'Dia Internacional da Mulher', date: (y) => at(y, 3, 8), suggestion: 'Homenagem às mulheres (clientes e equipe), sem clichê.' },
  { slug: 'dia-consumidor', label: 'Dia do Consumidor', date: (y) => at(y, 3, 15), niches: VAREJO, suggestion: 'Condição especial ou agradecimento ao cliente.' },
  { slug: 'pascoa', label: 'Páscoa', date: (y) => easter(y), niches: [...COMIDA, 'varejo', 'infantil'], suggestion: 'Campanha de Páscoa (produtos, encomendas, mensagem).' },
  { slug: 'dia-maes', label: 'Dia das Mães', date: (y) => nthWeekday(y, 5, 0, 2), niches: [...VAREJO, ...COMIDA, 'beleza', 'barbearia', 'turismo', 'saude', 'farmacia'], suggestion: 'Campanha emocional e presenteável para o Dia das Mães.' },
  { slug: 'dia-namorados', label: 'Dia dos Namorados', date: (y) => at(y, 6, 12), niches: [...VAREJO, ...COMIDA, 'beleza', 'barbearia', 'turismo'], suggestion: 'Campanha de presente e experiência a dois.' },
  { slug: 'festa-junina', label: 'Festa Junina', date: (y) => at(y, 6, 24), niches: [...COMIDA, 'agropecuaria', 'varejo', 'educacao'], suggestion: 'Arraiá: produtos, decoração ou evento junino.' },
  { slug: 'dia-motorista', label: 'Dia do Motorista', date: (y) => at(y, 7, 25), niches: ['automotivo', 'veiculos'], suggestion: 'Homenagem aos motoristas e dica de cuidado com o veículo.' },
  { slug: 'dia-agricultor', label: 'Dia do Agricultor', date: (y) => at(y, 7, 28), niches: ['agropecuaria'], suggestion: 'Homenagem ao produtor rural.' },
  { slug: 'dia-pais', label: 'Dia dos Pais', date: (y) => nthWeekday(y, 8, 0, 2), niches: [...VAREJO, ...COMIDA, 'barbearia', 'automotivo', 'turismo'], suggestion: 'Campanha de presente para o Dia dos Pais.' },
  { slug: 'dia-advogado', label: 'Dia do Advogado', date: (y) => at(y, 8, 11), niches: ['juridico'], suggestion: 'Homenagem à advocacia e ao papel do advogado.' },
  { slug: 'dia-corretor', label: 'Dia do Corretor de Imóveis', date: (y) => at(y, 8, 27), niches: ['imoveis'], suggestion: 'Homenagem aos corretores.' },
  { slug: 'dia-nutricionista', label: 'Dia do Nutricionista', date: (y) => at(y, 8, 31), niches: ['emagrecimento', 'saude', 'fitness'], suggestion: 'Homenagem e dica de alimentação.' },
  { slug: 'setembro-amarelo', label: 'Setembro Amarelo', date: (y) => at(y, 9, 1), niches: SAUDE, suggestion: 'Conscientização sobre saúde mental e prevenção ao suicídio (tom cuidadoso).' },
  { slug: 'dia-veterinario', label: 'Dia do Médico Veterinário', date: (y) => at(y, 9, 9), niches: ['pet', 'clinica_veterinaria', 'agropecuaria'], suggestion: 'Homenagem aos veterinários.' },
  { slug: 'dia-cliente', label: 'Dia do Cliente', date: (y) => at(y, 9, 15), suggestion: 'Agradecimento ao cliente, com condição especial se houver.' },
  { slug: 'dia-contador', label: 'Dia do Contador', date: (y) => at(y, 9, 22), niches: ['contabilidade'], suggestion: 'Homenagem aos contadores.' },
  { slug: 'outubro-rosa', label: 'Outubro Rosa', date: (y) => at(y, 10, 1), niches: [...SAUDE, 'beleza', 'moda'], suggestion: 'Conscientização sobre o câncer de mama.' },
  { slug: 'dia-criancas', label: 'Dia das Crianças', date: (y) => at(y, 10, 12), niches: ['infantil', 'varejo', 'moda', ...COMIDA, 'educacao', 'odontologia'], suggestion: 'Campanha do Dia das Crianças.' },
  { slug: 'dia-professor', label: 'Dia do Professor', date: (y) => at(y, 10, 15), niches: ['educacao'], suggestion: 'Homenagem aos professores.' },
  { slug: 'dia-medico', label: 'Dia do Médico', date: (y) => at(y, 10, 18), niches: ['saude'], suggestion: 'Homenagem aos médicos.' },
  { slug: 'dia-dentista', label: 'Dia do Dentista', date: (y) => at(y, 10, 25), niches: ['odontologia'], suggestion: 'Homenagem aos dentistas.' },
  { slug: 'novembro-azul', label: 'Novembro Azul', date: (y) => at(y, 11, 1), niches: [...SAUDE, 'barbearia'], suggestion: 'Conscientização sobre a saúde do homem e o câncer de próstata.' },
  { slug: 'black-friday', label: 'Black Friday', date: (y) => lastWeekday(y, 11, 5), niches: VAREJO, suggestion: 'Aquecimento e ofertas reais da Black Friday.' },
  // mais datas por nicho (01/11/2026; espelho em vps-api-server/lib/monthDates.mjs)
  { slug: 'dia-mundial-da-saude', label: 'Dia Mundial da Saúde', date: (y) => at(y, 4, 7), niches: SAUDE, suggestion: 'Conteúdo sobre cuidado com a saúde e prevenção.' },
  { slug: 'dia-da-enfermagem', label: 'Dia da Enfermagem', date: (y) => at(y, 5, 12), niches: ['saude'], suggestion: 'Homenagem à equipe de enfermagem.' },
  { slug: 'dia-do-trabalhador-rural', label: 'Dia do Trabalhador Rural', date: (y) => at(y, 5, 25), niches: ['agropecuaria'], suggestion: 'Homenagem ao trabalhador rural.' },
  { slug: 'dia-do-meio-ambiente', label: 'Dia do Meio Ambiente', date: (y) => at(y, 6, 5), niches: ['agropecuaria'], suggestion: 'Conteúdo sobre cuidado com a terra e a produção.' },
  { slug: 'dia-do-comerciante', label: 'Dia do Comerciante', date: (y) => at(y, 7, 16), niches: [...VAREJO, ...COMIDA, 'automotivo'], suggestion: 'Homenagem aos comerciantes e à equipe da loja.' },
  { slug: 'dia-do-estudante', label: 'Dia do Estudante', date: (y) => at(y, 8, 11), niches: ['educacao'], suggestion: 'Homenagem aos alunos.' },
  { slug: 'dia-do-psicologo', label: 'Dia do Psicólogo', date: (y) => at(y, 8, 27), niches: ['saude'], suggestion: 'Homenagem aos psicólogos.' },
  { slug: 'dia-do-profissional-de-educacao-fisica', label: 'Dia do Profissional de Educação Física', date: (y) => at(y, 9, 1), niches: ['fitness'], suggestion: 'Homenagem aos profissionais de educação física.' },
  { slug: 'dia-da-arvore', label: 'Dia da Árvore', date: (y) => at(y, 9, 21), niches: ['agropecuaria'], suggestion: 'Conteúdo sobre a natureza e o campo.' },
  { slug: 'dia-dos-animais', label: 'Dia dos Animais', date: (y) => at(y, 10, 4), niches: ['pet', 'clinica_veterinaria'], suggestion: 'Homenagem aos pets dos clientes.' },
  { slug: 'dia-do-engenheiro-agronomo', label: 'Dia do Engenheiro Agrônomo', date: (y) => at(y, 10, 12), niches: ['agropecuaria'], suggestion: 'Homenagem aos engenheiros agrônomos.' },
  { slug: 'dia-do-fisioterapeuta', label: 'Dia do Fisioterapeuta', date: (y) => at(y, 10, 13), niches: ['saude', 'fitness'], suggestion: 'Homenagem aos fisioterapeutas.' },
  { slug: 'dia-mundial-da-alimentacao', label: 'Dia Mundial da Alimentação', date: (y) => at(y, 10, 16), niches: [...COMIDA, 'emagrecimento'], suggestion: 'Conteúdo sobre boa alimentação.' },
  { slug: 'dia-do-arquiteto', label: 'Dia do Arquiteto', date: (y) => at(y, 12, 15), niches: ['construcao', 'imoveis'], suggestion: 'Homenagem aos arquitetos.' },
  { slug: 'dia-do-mecanico', label: 'Dia do Mecânico', date: (y) => at(y, 12, 20), niches: ['automotivo'], suggestion: 'Homenagem aos mecânicos.' },
  { slug: 'natal-campanha', label: 'Campanha de Natal', date: (y) => at(y, 12, 1), suggestion: 'Campanha e decoração de Natal, mensagem de fim de ano.' },
];

const daysBetween = (a: Date, b: Date) => Math.round((at(b.getFullYear(), b.getMonth() + 1, b.getDate()).getTime() - at(a.getFullYear(), a.getMonth() + 1, a.getDate()).getTime()) / 86400000);

function expand(rules: Rule[], kind: ArtSuggestionKind, today: Date, windowDays: number): ArtSuggestion[] {
  const out: ArtSuggestion[] = [];
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    for (const r of rules) {
      const d = r.date(y);
      const daysUntil = daysBetween(today, d);
      if (daysUntil < 0 || daysUntil > windowDays) continue;
      out.push({ id: `${kind}:${r.slug}:${y}`, kind, label: r.label, date: key(d), daysUntil, niches: r.niches ?? [], suggestion: r.suggestion });
    }
  }
  return out;
}

/**
 * O que a Ísis sugere a partir de hoje: feriados nos próximos `holidayDays` (padrão 30, para dar tempo de fazer a
 * arte) e datas do nicho nos próximos `seasonalDays` (padrão 45). Feriados primeiro, depois por data.
 */
export function artSuggestions(today = new Date(), { holidayDays = 30, seasonalDays = 45 } = {}): ArtSuggestion[] {
  return [...expand(HOLIDAY_RULES, 'feriado', today, holidayDays), ...expand(SEASONAL_RULES, 'sazonal', today, seasonalDays)]
    .sort((a, b) => (a.kind === b.kind ? a.daysUntil - b.daysUntil : a.kind === 'feriado' ? -1 : 1));
}

/** O cliente combina com a sugestão? (feriado e data sem nicho valem para todos) */
export const suggestionFitsClient = (s: ArtSuggestion, niche: string | null | undefined) =>
  s.kind === 'feriado' || s.niches.length === 0 || (!!niche && s.niches.includes(niche));

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Título do card — também é o que evita sugerir de novo para o mesmo cliente. */
export const suggestionCardTitle = (s: ArtSuggestion) =>
  s.kind === 'feriado' ? `Aviso de feriado · ${s.label} (${dataBr(s.date)})` : `${s.label} (${dataBr(s.date)})`;

/** Texto da arte: no feriado, "fechado" ou "estaremos abertos" conforme o cliente. */
export function suggestionCopy(s: ArtSuggestion, opts: { aberto?: boolean } = {}): string {
  if (s.kind === 'feriado') {
    return opts.aberto
      ? `Feriado de ${s.label} (${dataBr(s.date)}): estaremos abertos! [horário de funcionamento do dia]`
      : `Aviso: no feriado de ${s.label} (${dataBr(s.date)}) estaremos fechados. Retornamos no próximo dia útil.`;
  }
  return `${s.label} (${dataBr(s.date)}): ${s.suggestion}`;
}

/** Prazo do card: 2 dias antes da data (ou amanhã, se já estiver em cima). */
export function suggestionDueDate(s: ArtSuggestion, today = new Date()): string {
  const d = new Date(`${s.date}T12:00:00`);
  const due = addDays(d, -2);
  const amanha = addDays(today, 1);
  return key(due < amanha ? amanha : due);
}

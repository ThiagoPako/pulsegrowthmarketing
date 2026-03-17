// Seasonal marketing dates per niche
// Each date has month (1-12) and day, plus a label

export const NICHE_OPTIONS = [
  { value: 'farmacia', label: 'Farmácia' },
  { value: 'saude', label: 'Saúde' },
  { value: 'mercado', label: 'Mercado / Supermercado' },
  { value: 'varejo', label: 'Varejo' },
  { value: 'moda', label: 'Moda' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'emagrecimento', label: 'Emagrecimento' },
  { value: 'alimentacao', label: 'Alimentação / Restaurante' },
  { value: 'confeitaria', label: 'Confeitaria / Padaria' },
  { value: 'beleza', label: 'Beleza / Estética' },
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'educacao', label: 'Educação' },
  { value: 'tecnologia', label: 'Tecnologia' },
  { value: 'pet', label: 'Pet Shop / Veterinária' },
  { value: 'automotivo', label: 'Automotivo' },
  { value: 'imoveis', label: 'Imóveis' },
  { value: 'agropecuaria', label: 'Agropecuária' },
  { value: 'construcao', label: 'Material de Construção' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'otica', label: 'Ótica' },
  { value: 'joalheria', label: 'Joalheria / Relojoaria' },
  { value: 'turismo', label: 'Turismo / Hotelaria' },
  { value: 'infantil', label: 'Infantil / Brinquedos' },
  { value: 'moveis', label: 'Móveis / Decoração' },
  { value: 'clinica_veterinaria', label: 'Clínica Veterinária' },
  { value: 'limpeza', label: 'Limpeza / Produtos de Limpeza' },
  { value: 'grafica', label: 'Gráfica / Papelaria' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'outro', label: 'Outro' },
] as const;

export type NicheValue = typeof NICHE_OPTIONS[number]['value'];

interface SeasonalDate {
  month: number; // 1-12
  day: number;
  label: string;
  daysBeforeAlert: number; // how many days before to alert
}

// Universal dates that apply to ALL niches
const UNIVERSAL_DATES: SeasonalDate[] = [
  { month: 1, day: 1, label: 'Ano Novo', daysBeforeAlert: 30 },
  { month: 2, day: 14, label: 'Carnaval (aprox.)', daysBeforeAlert: 40 },
  { month: 3, day: 8, label: 'Dia Internacional da Mulher', daysBeforeAlert: 30 },
  { month: 3, day: 15, label: 'Dia do Consumidor', daysBeforeAlert: 30 },
  { month: 3, day: 22, label: 'Dia Mundial da Água', daysBeforeAlert: 20 },
  { month: 4, day: 18, label: 'Páscoa (aprox.)', daysBeforeAlert: 45 },
  { month: 4, day: 21, label: 'Tiradentes', daysBeforeAlert: 20 },
  { month: 4, day: 22, label: 'Dia da Terra', daysBeforeAlert: 20 },
  { month: 5, day: 1, label: 'Dia do Trabalho', daysBeforeAlert: 30 },
  { month: 5, day: 11, label: 'Dia das Mães', daysBeforeAlert: 40 },
  { month: 6, day: 5, label: 'Dia Mundial do Meio Ambiente', daysBeforeAlert: 25 },
  { month: 6, day: 12, label: 'Dia dos Namorados', daysBeforeAlert: 40 },
  { month: 6, day: 24, label: 'São João / Festa Junina', daysBeforeAlert: 40 },
  { month: 7, day: 20, label: 'Dia do Amigo', daysBeforeAlert: 30 },
  { month: 8, day: 10, label: 'Dia dos Pais', daysBeforeAlert: 40 },
  { month: 8, day: 15, label: 'Dia dos Solteiros', daysBeforeAlert: 25 },
  { month: 9, day: 7, label: 'Independência do Brasil', daysBeforeAlert: 30 },
  { month: 9, day: 15, label: 'Dia do Cliente', daysBeforeAlert: 30 },
  { month: 9, day: 21, label: 'Dia da Árvore', daysBeforeAlert: 20 },
  { month: 10, day: 12, label: 'Dia das Crianças', daysBeforeAlert: 40 },
  { month: 10, day: 31, label: 'Halloween', daysBeforeAlert: 30 },
  { month: 11, day: 20, label: 'Dia da Consciência Negra', daysBeforeAlert: 30 },
  { month: 11, day: 25, label: 'Black Friday (aprox.)', daysBeforeAlert: 45 },
  { month: 11, day: 28, label: 'Cyber Monday', daysBeforeAlert: 40 },
  { month: 12, day: 25, label: 'Natal', daysBeforeAlert: 45 },
  { month: 12, day: 31, label: 'Réveillon (preparação)', daysBeforeAlert: 40 },
];

// Niche-specific dates
const NICHE_DATES: Record<string, SeasonalDate[]> = {
  farmacia: [
    { month: 1, day: 20, label: 'Dia do Farmacêutico', daysBeforeAlert: 20 },
    { month: 4, day: 7, label: 'Dia Mundial da Saúde', daysBeforeAlert: 30 },
    { month: 5, day: 17, label: 'Dia da Reciclagem (embalagens)', daysBeforeAlert: 20 },
    { month: 5, day: 26, label: 'Dia da Prevenção de Alergia', daysBeforeAlert: 20 },
    { month: 6, day: 26, label: 'Dia do Combate às Drogas', daysBeforeAlert: 20 },
    { month: 8, day: 5, label: 'Dia Nacional da Farmácia', daysBeforeAlert: 30 },
    { month: 9, day: 5, label: 'Dia do Farmacêutico', daysBeforeAlert: 20 },
    { month: 9, day: 10, label: 'Dia do Medicamento Genérico', daysBeforeAlert: 20 },
    { month: 10, day: 1, label: 'Outubro Rosa', daysBeforeAlert: 40 },
    { month: 11, day: 1, label: 'Novembro Azul', daysBeforeAlert: 40 },
    { month: 11, day: 14, label: 'Dia Mundial do Diabetes', daysBeforeAlert: 25 },
  ],
  saude: [
    { month: 1, day: 31, label: 'Dia do Médico Infectologista', daysBeforeAlert: 20 },
    { month: 2, day: 4, label: 'Dia Mundial do Câncer', daysBeforeAlert: 30 },
    { month: 2, day: 15, label: 'Dia do Psicólogo Hospitalar', daysBeforeAlert: 20 },
    { month: 3, day: 26, label: 'Dia do Nutricionista (Púrpura)', daysBeforeAlert: 30 },
    { month: 4, day: 7, label: 'Dia Mundial da Saúde', daysBeforeAlert: 30 },
    { month: 5, day: 12, label: 'Dia do Enfermeiro', daysBeforeAlert: 25 },
    { month: 5, day: 31, label: 'Dia Mundial sem Tabaco', daysBeforeAlert: 25 },
    { month: 6, day: 14, label: 'Dia do Doador de Sangue', daysBeforeAlert: 20 },
    { month: 7, day: 8, label: 'Dia do Dermatologista', daysBeforeAlert: 20 },
    { month: 7, day: 27, label: 'Dia do Médico Ortopedista', daysBeforeAlert: 20 },
    { month: 8, day: 22, label: 'Dia do Nutricionista', daysBeforeAlert: 25 },
    { month: 9, day: 10, label: 'Dia Mundial de Prevenção ao Suicídio (Setembro Amarelo)', daysBeforeAlert: 40 },
    { month: 10, day: 1, label: 'Outubro Rosa (mês inteiro)', daysBeforeAlert: 40 },
    { month: 10, day: 18, label: 'Dia do Médico', daysBeforeAlert: 25 },
    { month: 11, day: 1, label: 'Novembro Azul (mês inteiro)', daysBeforeAlert: 40 },
    { month: 11, day: 14, label: 'Dia Mundial do Diabetes', daysBeforeAlert: 25 },
    { month: 12, day: 1, label: 'Dia Mundial de Luta Contra a AIDS (Dezembro Vermelho)', daysBeforeAlert: 30 },
    { month: 12, day: 3, label: 'Dia Internacional da Pessoa com Deficiência', daysBeforeAlert: 20 },
  ],
  mercado: [
    { month: 1, day: 15, label: 'Volta às Aulas (compras)', daysBeforeAlert: 30 },
    { month: 3, day: 15, label: 'Dia do Consumidor', daysBeforeAlert: 30 },
    { month: 6, day: 1, label: 'Arraiá / Produtos Juninos', daysBeforeAlert: 40 },
    { month: 11, day: 12, label: 'Dia do Supermercado', daysBeforeAlert: 20 },
  ],
  varejo: [
    { month: 1, day: 11, label: 'Início de Liquidações', daysBeforeAlert: 30 },
    { month: 3, day: 15, label: 'Dia do Consumidor', daysBeforeAlert: 30 },
    { month: 7, day: 1, label: 'Liquidação de Inverno', daysBeforeAlert: 30 },
    { month: 9, day: 15, label: 'Semana do Brasil', daysBeforeAlert: 30 },
  ],
  moda: [
    { month: 1, day: 11, label: 'Liquidação de Verão', daysBeforeAlert: 30 },
    { month: 3, day: 8, label: 'Dia da Mulher (moda feminina)', daysBeforeAlert: 40 },
    { month: 7, day: 1, label: 'Liquidação de Inverno', daysBeforeAlert: 30 },
    { month: 9, day: 5, label: 'Dia da Amazônia (moda sustentável)', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Black Friday Moda', daysBeforeAlert: 45 },
  ],
  fitness: [
    { month: 1, day: 1, label: 'Metas de Ano Novo', daysBeforeAlert: 30 },
    { month: 1, day: 1, label: 'Janeiro Branco (saúde mental + exercício)', daysBeforeAlert: 30 },
    { month: 3, day: 31, label: 'Dia da Saúde e Nutrição', daysBeforeAlert: 25 },
    { month: 4, day: 6, label: 'Dia Mundial da Atividade Física', daysBeforeAlert: 30 },
    { month: 5, day: 6, label: 'Dia do Alongamento', daysBeforeAlert: 20 },
    { month: 6, day: 1, label: 'Projeto Verão começa!', daysBeforeAlert: 30 },
    { month: 8, day: 6, label: 'Dia do Profissional de Ed. Física', daysBeforeAlert: 20 },
    { month: 9, day: 1, label: 'Setembro Amarelo (saúde mental e exercício)', daysBeforeAlert: 30 },
    { month: 10, day: 10, label: 'Dia Mundial da Saúde Mental', daysBeforeAlert: 25 },
    { month: 11, day: 1, label: 'Desafio Novembro (treino intensivo)', daysBeforeAlert: 25 },
  ],
  emagrecimento: [
    { month: 1, day: 1, label: 'Resoluções de Ano Novo', daysBeforeAlert: 30 },
    { month: 3, day: 26, label: 'Dia do Nutricionista', daysBeforeAlert: 30 },
    { month: 3, day: 10, label: 'Dia de Combate ao Sedentarismo', daysBeforeAlert: 20 },
    { month: 6, day: 1, label: 'Projeto Verão', daysBeforeAlert: 30 },
    { month: 10, day: 16, label: 'Dia Mundial da Alimentação', daysBeforeAlert: 20 },
  ],
  alimentacao: [
    { month: 1, day: 6, label: 'Dia de Reis', daysBeforeAlert: 20 },
    { month: 3, day: 2, label: 'Dia do Cozinheiro', daysBeforeAlert: 20 },
    { month: 5, day: 13, label: 'Dia do Churrasco', daysBeforeAlert: 20 },
    { month: 7, day: 25, label: 'Dia do Escritor (storytelling gastro)', daysBeforeAlert: 20 },
    { month: 8, day: 12, label: 'Dia da Pizza', daysBeforeAlert: 20 },
    { month: 10, day: 16, label: 'Dia Mundial da Alimentação', daysBeforeAlert: 30 },
  ],
  beleza: [
    { month: 1, day: 20, label: 'Dia do Cabeleireiro', daysBeforeAlert: 20 },
    { month: 3, day: 8, label: 'Dia da Mulher', daysBeforeAlert: 40 },
    { month: 5, day: 8, label: 'Dia do Profissional de Marketing (autocuidado)', daysBeforeAlert: 20 },
    { month: 6, day: 12, label: 'Dia dos Namorados (looks)', daysBeforeAlert: 40 },
    { month: 8, day: 5, label: 'Dia Nacional da Saúde', daysBeforeAlert: 20 },
    { month: 10, day: 1, label: 'Outubro Rosa', daysBeforeAlert: 40 },
  ],
  educacao: [
    { month: 1, day: 15, label: 'Volta às Aulas', daysBeforeAlert: 40 },
    { month: 3, day: 14, label: 'Dia Nacional da Poesia', daysBeforeAlert: 20 },
    { month: 3, day: 15, label: 'Dia da Escola', daysBeforeAlert: 30 },
    { month: 4, day: 28, label: 'Dia da Educação', daysBeforeAlert: 30 },
    { month: 7, day: 25, label: 'Dia do Escritor', daysBeforeAlert: 20 },
    { month: 8, day: 11, label: 'Dia do Estudante', daysBeforeAlert: 30 },
    { month: 10, day: 15, label: 'Dia do Professor', daysBeforeAlert: 30 },
    { month: 11, day: 17, label: 'Dia da Criatividade e Inovação na Educação', daysBeforeAlert: 20 },
  ],
  tecnologia: [
    { month: 1, day: 28, label: 'Dia Internacional da Proteção de Dados', daysBeforeAlert: 20 },
    { month: 3, day: 15, label: 'Dia do Consumidor (tech deals)', daysBeforeAlert: 30 },
    { month: 5, day: 17, label: 'Dia da Internet', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Black Friday Tech', daysBeforeAlert: 45 },
    { month: 11, day: 30, label: 'Dia da Segurança da Informação', daysBeforeAlert: 20 },
  ],
  pet: [
    { month: 3, day: 14, label: 'Dia Nacional dos Animais', daysBeforeAlert: 30 },
    { month: 4, day: 28, label: 'Dia da Educação (pet education)', daysBeforeAlert: 20 },
    { month: 6, day: 5, label: 'Dia Mundial do Meio Ambiente (pet eco)', daysBeforeAlert: 20 },
    { month: 9, day: 9, label: 'Dia do Veterinário', daysBeforeAlert: 30 },
    { month: 10, day: 4, label: 'Dia dos Animais', daysBeforeAlert: 30 },
  ],
  automotivo: [
    { month: 5, day: 13, label: 'Dia do Automóvel', daysBeforeAlert: 30 },
    { month: 7, day: 25, label: 'Dia do Motorista', daysBeforeAlert: 20 },
    { month: 9, day: 25, label: 'Dia do Trânsito', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Black Friday Automotiva', daysBeforeAlert: 40 },
  ],
  imoveis: [
    { month: 3, day: 15, label: 'Dia do Consumidor (imóveis)', daysBeforeAlert: 30 },
    { month: 5, day: 11, label: 'Dia das Mães (lar ideal)', daysBeforeAlert: 30 },
    { month: 8, day: 25, label: 'Dia do Corretor de Imóveis', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Feirão Imobiliário', daysBeforeAlert: 40 },
  ],
  juridico: [
    { month: 1, day: 1, label: 'Novas Leis do Ano', daysBeforeAlert: 20 },
    { month: 3, day: 15, label: 'Dia do Consumidor (direitos)', daysBeforeAlert: 30 },
    { month: 8, day: 11, label: 'Dia do Advogado', daysBeforeAlert: 30 },
    { month: 12, day: 10, label: 'Dia da Declaração dos Direitos Humanos', daysBeforeAlert: 20 },
  ],
  contabilidade: [
    { month: 1, day: 31, label: 'Prazo IR (preparação)', daysBeforeAlert: 45 },
    { month: 3, day: 1, label: 'Início Declaração IR', daysBeforeAlert: 40 },
    { month: 4, day: 25, label: 'Dia do Contabilista', daysBeforeAlert: 20 },
    { month: 5, day: 31, label: 'Fim do Prazo IR', daysBeforeAlert: 45 },
    { month: 9, day: 22, label: 'Dia do Contador', daysBeforeAlert: 20 },
    { month: 12, day: 1, label: 'Planejamento Tributário (próximo ano)', daysBeforeAlert: 40 },
  ],
  confeitaria: [
    { month: 2, day: 14, label: 'Carnaval (doces temáticos)', daysBeforeAlert: 40 },
    { month: 3, day: 2, label: 'Dia do Cozinheiro', daysBeforeAlert: 20 },
    { month: 4, day: 20, label: 'Páscoa (ovos e colombas)', daysBeforeAlert: 45 },
    { month: 5, day: 11, label: 'Dia das Mães (bolos e doces)', daysBeforeAlert: 40 },
    { month: 6, day: 12, label: 'Dia dos Namorados (doces especiais)', daysBeforeAlert: 40 },
    { month: 6, day: 24, label: 'Festa Junina (doces típicos)', daysBeforeAlert: 40 },
    { month: 8, day: 10, label: 'Dia dos Pais (encomendas)', daysBeforeAlert: 40 },
    { month: 10, day: 11, label: 'Dia do Confeiteiro', daysBeforeAlert: 20 },
    { month: 10, day: 12, label: 'Dia das Crianças (doces temáticos)', daysBeforeAlert: 40 },
    { month: 10, day: 31, label: 'Halloween (doces temáticos)', daysBeforeAlert: 30 },
    { month: 12, day: 25, label: 'Natal (panetones e cestas)', daysBeforeAlert: 50 },
  ],
  barbearia: [
    { month: 1, day: 25, label: 'Dia do Barbeiro', daysBeforeAlert: 20 },
    { month: 3, day: 8, label: 'Dia da Mulher (barba do marido)', daysBeforeAlert: 30 },
    { month: 6, day: 12, label: 'Dia dos Namorados (visual novo)', daysBeforeAlert: 40 },
    { month: 8, day: 10, label: 'Dia dos Pais (presente pai)', daysBeforeAlert: 40 },
    { month: 8, day: 15, label: 'Dia do Homem', daysBeforeAlert: 30 },
    { month: 11, day: 1, label: 'Novembro Azul (saúde masculina)', daysBeforeAlert: 40 },
  ],
  agropecuaria: [
    { month: 1, day: 13, label: 'Dia da Pecuária', daysBeforeAlert: 20 },
    { month: 3, day: 14, label: 'Dia Nacional dos Animais', daysBeforeAlert: 30 },
    { month: 5, day: 3, label: 'Dia do Solo', daysBeforeAlert: 20 },
    { month: 5, day: 13, label: 'Dia do Agricultor', daysBeforeAlert: 30 },
    { month: 6, day: 5, label: 'Dia do Meio Ambiente', daysBeforeAlert: 30 },
    { month: 7, day: 28, label: 'Dia do Agricultor Familiar', daysBeforeAlert: 20 },
    { month: 8, day: 15, label: 'Exposições Agropecuárias (período)', daysBeforeAlert: 40 },
    { month: 10, day: 15, label: 'Dia do Desenvolvimento Rural', daysBeforeAlert: 20 },
    { month: 10, day: 29, label: 'Dia do Veterinário', daysBeforeAlert: 20 },
  ],
  construcao: [
    { month: 3, day: 15, label: 'Dia do Consumidor (promoções)', daysBeforeAlert: 30 },
    { month: 5, day: 1, label: 'Dia do Trabalho (construção)', daysBeforeAlert: 30 },
    { month: 6, day: 15, label: 'Dia do Engenheiro', daysBeforeAlert: 20 },
    { month: 8, day: 11, label: 'Dia do Estudante (reformas)', daysBeforeAlert: 20 },
    { month: 10, day: 5, label: 'Dia da Construção Civil', daysBeforeAlert: 30 },
    { month: 11, day: 25, label: 'Black Friday Construção', daysBeforeAlert: 45 },
    { month: 12, day: 11, label: 'Dia do Arquiteto', daysBeforeAlert: 20 },
  ],
  odontologia: [
    { month: 3, day: 20, label: 'Dia Mundial da Saúde Bucal', daysBeforeAlert: 30 },
    { month: 4, day: 7, label: 'Dia Mundial da Saúde', daysBeforeAlert: 30 },
    { month: 6, day: 12, label: 'Dia dos Namorados (sorriso novo)', daysBeforeAlert: 40 },
    { month: 8, day: 5, label: 'Dia Nacional da Saúde', daysBeforeAlert: 20 },
    { month: 10, day: 3, label: 'Dia do Dentista', daysBeforeAlert: 30 },
    { month: 10, day: 25, label: 'Dia da Saúde Bucal', daysBeforeAlert: 20 },
  ],
  otica: [
    { month: 3, day: 10, label: 'Dia do Oftalmologista', daysBeforeAlert: 20 },
    { month: 5, day: 11, label: 'Dia das Mães (óculos presente)', daysBeforeAlert: 40 },
    { month: 7, day: 10, label: 'Dia da Saúde Ocular', daysBeforeAlert: 30 },
    { month: 8, day: 10, label: 'Dia dos Pais (óculos solar)', daysBeforeAlert: 40 },
    { month: 11, day: 25, label: 'Black Friday Ótica', daysBeforeAlert: 45 },
    { month: 12, day: 1, label: 'Verão (óculos de sol)', daysBeforeAlert: 40 },
  ],
  joalheria: [
    { month: 3, day: 8, label: 'Dia da Mulher (joias)', daysBeforeAlert: 40 },
    { month: 5, day: 11, label: 'Dia das Mães (presente especial)', daysBeforeAlert: 45 },
    { month: 6, day: 12, label: 'Dia dos Namorados (alianças)', daysBeforeAlert: 45 },
    { month: 8, day: 10, label: 'Dia dos Pais (relógios)', daysBeforeAlert: 40 },
    { month: 11, day: 25, label: 'Black Friday Joalheria', daysBeforeAlert: 45 },
    { month: 12, day: 25, label: 'Natal (presentes luxo)', daysBeforeAlert: 45 },
  ],
  turismo: [
    { month: 1, day: 1, label: 'Férias de Verão', daysBeforeAlert: 45 },
    { month: 2, day: 14, label: 'Carnaval (pacotes)', daysBeforeAlert: 45 },
    { month: 3, day: 27, label: 'Dia do Turismo', daysBeforeAlert: 30 },
    { month: 6, day: 12, label: 'Dia dos Namorados (viagens)', daysBeforeAlert: 40 },
    { month: 7, day: 1, label: 'Férias de Inverno', daysBeforeAlert: 45 },
    { month: 9, day: 27, label: 'Dia Mundial do Turismo', daysBeforeAlert: 30 },
    { month: 11, day: 25, label: 'Black Friday Viagens', daysBeforeAlert: 45 },
  ],
  infantil: [
    { month: 1, day: 15, label: 'Volta às Aulas', daysBeforeAlert: 40 },
    { month: 3, day: 8, label: 'Dia da Mulher (mãe)', daysBeforeAlert: 30 },
    { month: 5, day: 11, label: 'Dia das Mães', daysBeforeAlert: 40 },
    { month: 6, day: 24, label: 'Festa Junina (fantasias)', daysBeforeAlert: 40 },
    { month: 8, day: 10, label: 'Dia dos Pais', daysBeforeAlert: 40 },
    { month: 10, day: 12, label: 'Dia das Crianças', daysBeforeAlert: 50 },
    { month: 10, day: 31, label: 'Halloween (fantasias)', daysBeforeAlert: 30 },
    { month: 12, day: 25, label: 'Natal (brinquedos)', daysBeforeAlert: 50 },
  ],
  moveis: [
    { month: 1, day: 11, label: 'Liquidação de Início de Ano', daysBeforeAlert: 30 },
    { month: 3, day: 15, label: 'Dia do Consumidor', daysBeforeAlert: 30 },
    { month: 5, day: 11, label: 'Dia das Mães (lar)', daysBeforeAlert: 40 },
    { month: 6, day: 12, label: 'Dia dos Namorados (casa nova)', daysBeforeAlert: 40 },
    { month: 8, day: 5, label: 'Dia do Decorador', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Black Friday Móveis', daysBeforeAlert: 45 },
  ],
  clinica_veterinaria: [
    { month: 3, day: 14, label: 'Dia Nacional dos Animais', daysBeforeAlert: 30 },
    { month: 4, day: 28, label: 'Dia da Caatinga (fauna)', daysBeforeAlert: 20 },
    { month: 6, day: 5, label: 'Dia do Meio Ambiente', daysBeforeAlert: 20 },
    { month: 7, day: 14, label: 'Dia do Cão sem Raça Definida', daysBeforeAlert: 20 },
    { month: 8, day: 26, label: 'Dia do Cão', daysBeforeAlert: 30 },
    { month: 9, day: 9, label: 'Dia do Veterinário', daysBeforeAlert: 30 },
    { month: 10, day: 4, label: 'Dia dos Animais', daysBeforeAlert: 30 },
    { month: 10, day: 29, label: 'Dia Nacional do Gato', daysBeforeAlert: 20 },
  ],
  limpeza: [
    { month: 2, day: 16, label: 'Dia da Limpeza Urbana', daysBeforeAlert: 20 },
    { month: 5, day: 5, label: 'Dia da Higiene', daysBeforeAlert: 20 },
    { month: 5, day: 17, label: 'Dia da Reciclagem', daysBeforeAlert: 20 },
    { month: 6, day: 5, label: 'Dia do Meio Ambiente', daysBeforeAlert: 30 },
    { month: 10, day: 15, label: 'Dia do Lavador (limpeza geral)', daysBeforeAlert: 20 },
  ],
  grafica: [
    { month: 2, day: 1, label: 'Dia do Publicitário', daysBeforeAlert: 20 },
    { month: 5, day: 8, label: 'Dia do Profissional de Marketing', daysBeforeAlert: 20 },
    { month: 7, day: 25, label: 'Dia do Escritor', daysBeforeAlert: 20 },
    { month: 11, day: 1, label: 'Dia do Designer Gráfico', daysBeforeAlert: 20 },
    { month: 11, day: 25, label: 'Black Friday Gráfica', daysBeforeAlert: 40 },
  ],
  outro: [],
};

/**
 * Returns upcoming seasonal dates for a given niche within the next X days
 */
export function getUpcomingSeasonalDates(
  niche: string,
  daysAhead: number = 30
): { label: string; date: Date; daysUntil: number }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  const allDates = [
    ...UNIVERSAL_DATES,
    ...(NICHE_DATES[niche] || []),
  ];

  const results: { label: string; date: Date; daysUntil: number }[] = [];

  for (const sd of allDates) {
    // Check this year and next year
    for (const year of [currentYear, currentYear + 1]) {
      const eventDate = new Date(year, sd.month - 1, sd.day);
      const diffMs = eventDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= daysAhead) {
        results.push({
          label: sd.label,
          date: eventDate,
          daysUntil: diffDays,
        });
      }
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Returns dates that need content creation alerts (within their daysBeforeAlert window)
 */
export function getSeasonalAlerts(
  niche: string
): { label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low' }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  const allDates = [
    ...UNIVERSAL_DATES,
    ...(NICHE_DATES[niche] || []),
  ];

  const results: { label: string; date: Date; daysUntil: number; urgency: 'high' | 'medium' | 'low' }[] = [];

  for (const sd of allDates) {
    for (const year of [currentYear, currentYear + 1]) {
      const eventDate = new Date(year, sd.month - 1, sd.day);
      const diffMs = eventDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0 && diffDays <= sd.daysBeforeAlert) {
        const urgency = diffDays <= 10 ? 'high' : diffDays <= 20 ? 'medium' : 'low';
        results.push({ label: sd.label, date: eventDate, daysUntil: diffDays, urgency });
      }
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

import type { CampaignType } from './campaignsUtils';
import {
  Pill, Stethoscope, ShoppingCart, Store, Shirt, Dumbbell, Scale, Utensils, Cake,
  Sparkles as SparklesIcon, Scissors, GraduationCap, Cpu, Dog, Car, CarFront, Home,
  Sprout, HardHat, Smile, Glasses, Gem, Plane, ToyBrick, Sofa, Stethoscope as VetIcon,
  SprayCan, Printer, Landmark, Calculator, Package,
} from 'lucide-react';

/**
 * Sugestão de campanha para um nicho: tipo, ângulo comercial e exemplo prático.
 */
export interface NicheCampaignIdea {
  type: CampaignType;
  angle: string;      // ângulo/motivo (curto)
  example: string;    // exemplo pronto de aplicação
}

export interface NicheSuggestion {
  icon: any;
  accent: string;
  headline: string;   // frase que resume como esse nicho vende
  campaigns: NicheCampaignIdea[];
}

/**
 * Sugestões estratégicas por nicho. Cada nicho recebe 3–4 tipos de campanha
 * que historicamente performam melhor pra ele, com ângulo e exemplo prático.
 */
export const NICHE_CAMPAIGN_SUGGESTIONS: Record<string, NicheSuggestion> = {
  farmacia: {
    icon: Pill, accent: '#22c55e',
    headline: 'Recorrência + confiança do farmacêutico. Vende quem lembra e quem tem preço bom.',
    campaigns: [
      { type: 'promocional', angle: 'Preço/genérico da semana', example: 'Combo higiene + medicamento genérico com 30% off — postar toda segunda com Stories de contagem regressiva.' },
      { type: 'sazonal', angle: 'Campanhas de saúde do mês', example: 'Novembro Azul: kit exame + condição especial para maridos/pais durante o mês.' },
      { type: 'institucional', angle: 'Autoridade do farmacêutico', example: 'Série "pergunte ao farmacêutico" respondendo dúvidas reais dos comentários.' },
      { type: 'responsabilidade_social', angle: 'Campanha de arrecadação/vacinação', example: 'Cada compra acima de R$ 100 doa 1 kit de higiene pra ILPI local.' },
    ],
  },
  saude: {
    icon: Stethoscope, accent: '#38bdf8',
    headline: 'Autoridade médica é o ativo mais caro. Institucional puxa, promocional converte.',
    campaigns: [
      { type: 'institucional', angle: 'Autoridade e didática', example: 'Reels de 60s explicando um sintoma comum → CTA agendar avaliação.' },
      { type: 'sazonal', angle: 'Datas de conscientização', example: 'Outubro Rosa: pacote de check-up mama + agenda estendida.' },
      { type: 'evento', angle: 'Palestra gratuita = base de leads', example: 'Palestra online sobre "menopausa sem sofrer" → captura WhatsApp → oferta pós-evento.' },
      { type: 'lancamento', angle: 'Novo tratamento / equipamento', example: 'Chegou tecnologia X: teaser 15 dias + explicação + primeiros pacientes com preço fundador.' },
    ],
  },
  mercado: {
    icon: ShoppingCart, accent: '#f97316',
    headline: 'Volume alto, ticket baixo, decisão rápida. Ofertas semanais no ritmo do salário.',
    campaigns: [
      { type: 'promocional', angle: 'Encarte da semana', example: 'Reels de "top 10 ofertas da semana" toda segunda e quinta + Stories diários com 1 produto isca.' },
      { type: 'sazonal', angle: 'Datas do calendário do consumo', example: 'Kit dia dos pais (churrasco), Kit Natal, Kit volta às aulas.' },
      { type: 'institucional', angle: 'Bastidor de sortimento e frescor', example: 'Série "hoje na peixaria/hortifruti" mostrando produto chegando.' },
    ],
  },
  varejo: {
    icon: Store, accent: '#e879f9',
    headline: 'Giro rápido. Precisa vender agora, com prova social visual.',
    campaigns: [
      { type: 'promocional', angle: 'Queima / liquidação relâmpago', example: '"Só hoje: 3 por R$ 99" + contagem regressiva em Stories + comentário fixado com link do WhatsApp.' },
      { type: 'sazonal', angle: 'Datas comerciais fortes', example: 'Black Friday, Dia das Mães, Dia dos Namorados com pré-teaser 10 dias antes.' },
      { type: 'lancamento', angle: 'Nova coleção / novo lote', example: '"Chegou coleção X" com try-on da vendedora + lista VIP com 10% off.' },
      { type: 'institucional', angle: 'Bastidor da loja', example: 'Time da loja, curadoria, atendimento personalizado.' },
    ],
  },
  moda: {
    icon: Shirt, accent: '#ec4899',
    headline: 'Moda vende com desejo e prova social. Look montado + gente real.',
    campaigns: [
      { type: 'lancamento', angle: 'Drop de coleção', example: 'Teaser 7 dias + editorial de foto + lista VIP com acesso 24h antes.' },
      { type: 'sazonal', angle: 'Verão, inverno, festas', example: '"Guarda-roupa de férias em 5 peças" no início do verão.' },
      { type: 'promocional', angle: 'Combo look completo', example: 'Look inteiro por R$ X (calça + camisa + tênis) — carrossel de looks montados.' },
      { type: 'evento', angle: 'Bazar / desfile como isca', example: 'Bazar-desfile com inscrição por WhatsApp → base captada vira campanha de reengajamento.' },
    ],
  },
  fitness: {
    icon: Dumbbell, accent: '#f59e0b',
    headline: 'Transformação visível vende plano. Antes/depois + rotina.',
    campaigns: [
      { type: 'sazonal', angle: 'Janela de motivação (janeiro, pré-verão)', example: '"Projeto verão em 90 dias" com plano especial começando em outubro.' },
      { type: 'evento', angle: 'Aulão gratuito', example: 'Aulão open no sábado com inscrição → base captada recebe oferta de matrícula na segunda.' },
      { type: 'institucional', angle: 'Método + professores', example: 'Série "conheça seu treino" mostrando cada modalidade e o professor por trás.' },
      { type: 'promocional', angle: 'Matrícula sem taxa', example: 'Últimos 3 dias do mês: matrícula zero + 1 mês grátis pra quem indicar.' },
    ],
  },
  emagrecimento: {
    icon: Scale, accent: '#84cc16',
    headline: 'Vende quem prova resultado real e humaniza a jornada.',
    campaigns: [
      { type: 'institucional', angle: 'Cases reais de pacientes', example: 'Série "história da Maria" mostrando 90 dias de acompanhamento (com autorização).' },
      { type: 'sazonal', angle: 'Pré-verão + pós-festas', example: 'Programa "detox de janeiro" e "corpo pronto pro verão" (setembro).' },
      { type: 'evento', angle: 'Live de avaliação gratuita', example: 'Live "quiz do metabolismo" + convite pra avaliação gratuita = leads.' },
      { type: 'promocional', angle: 'Pacote com bônus', example: 'Pacote 3 meses + bioimpedância grátis + acompanhamento nutri.' },
    ],
  },
  alimentacao: {
    icon: Utensils, accent: '#f97316',
    headline: 'Comida entra pelos olhos e pela hora. Timing (almoço/jantar) é tudo.',
    campaigns: [
      { type: 'promocional', angle: 'Prato da semana / combo casal', example: 'Segunda a quinta: combo pra dois com sobremesa por R$ X. Reels do prato em close.' },
      { type: 'sazonal', angle: 'Datas do apetite', example: 'Menu especial Dia dos Namorados / Dia dos Pais (churrasco) / Ceia de Natal.' },
      { type: 'institucional', angle: 'Bastidor da cozinha', example: 'Chef preparando o prato, ingredientes chegando, história do restaurante.' },
      { type: 'evento', angle: 'Jantar temático / degustação', example: 'Jantar harmonizado com inscrição → base captada vira lista de eventos futuros.' },
    ],
  },
  confeitaria: {
    icon: Cake, accent: '#ec4899',
    headline: 'Encomenda é planejada. Antecipe a data.',
    campaigns: [
      { type: 'sazonal', angle: 'Páscoa, Dia das Mães, Natal', example: 'Catálogo de Páscoa aberto 30 dias antes + últimas encomendas 3 dias antes.' },
      { type: 'promocional', angle: 'Combo festa / kit lanche', example: 'Kit festa 20 pessoas por R$ X — arte + Stories diários da produção.' },
      { type: 'lancamento', angle: 'Novo sabor / linha nova', example: 'Reveal de sabor novo com pré-venda por 48h.' },
    ],
  },
  beleza: {
    icon: SparklesIcon, accent: '#e879f9',
    headline: 'Transformação em vídeo curto + agenda sempre visível.',
    campaigns: [
      { type: 'lancamento', angle: 'Novo procedimento / protocolo', example: 'Teaser 7 dias + demonstração + primeiras 10 pessoas com preço fundador.' },
      { type: 'sazonal', angle: 'Pré-eventos / verão', example: 'Pacote "noiva 90 dias" ou "prontas pro verão" em setembro.' },
      { type: 'promocional', angle: 'Combo de serviços', example: 'Terça e quarta: combo escova + design de sobrancelha com 25% off.' },
      { type: 'institucional', angle: 'Portfólio da profissional', example: 'Antes/depois com autorização + rotina do dia.' },
    ],
  },
  barbearia: {
    icon: Scissors, accent: '#0ea5e9',
    headline: 'Recorrência mensal. Vende quem lembra o cliente na hora certa.',
    campaigns: [
      { type: 'promocional', angle: 'Combo corte + barba + terça em baixa', example: 'Terça e quarta: combo com 20% off, agenda no WhatsApp.' },
      { type: 'sazonal', angle: 'Dia dos Pais / véspera de festas', example: '"Pai bem cuidado é presente" — pacote pai + filho.' },
      { type: 'institucional', angle: 'Barbeiro-personagem', example: 'Cada barbeiro com sua rotina/estilo → cliente escolhe pelo perfil.' },
    ],
  },
  educacao: {
    icon: GraduationCap, accent: '#6366f1',
    headline: 'Decisão longa. Autoridade + evento captam, promocional fecha.',
    campaigns: [
      { type: 'evento', angle: 'Aula aberta / mentoria gratuita', example: 'Aula gratuita "como passar em X" → captura WhatsApp → oferta de curso 48h depois.' },
      { type: 'lancamento', angle: 'Nova turma / novo curso', example: 'Turma nova: teaser 15 dias + lista de espera + condição fundador nas primeiras 20 vagas.' },
      { type: 'institucional', angle: 'Depoimento de aluno aprovado', example: 'Série "quem passou em X estudou aqui" com prova visual.' },
      { type: 'sazonal', angle: 'Volta às aulas / pré-vestibular', example: 'Janeiro (volta às aulas) e julho (segundo semestre).' },
    ],
  },
  tecnologia: {
    icon: Cpu, accent: '#38bdf8',
    headline: 'Vende quem explica em linguagem simples e mostra resultado.',
    campaigns: [
      { type: 'lancamento', angle: 'Feature nova / produto novo', example: 'Reveal + demo em vídeo + trial de 14 dias.' },
      { type: 'institucional', angle: 'Case de cliente com número', example: '"Cliente X economizou R$ Y usando nossa solução" — depoimento + tela.' },
      { type: 'evento', angle: 'Webinar / demo ao vivo', example: 'Webinar com inscrição = leads B2B qualificados.' },
    ],
  },
  pet: {
    icon: Dog, accent: '#f59e0b',
    headline: 'Emoção pura. Pet + tutor + rotina vendem sozinhos.',
    campaigns: [
      { type: 'promocional', angle: 'Combo banho+tosa+vacina', example: 'Terça e quarta: combo com 20% off + hora marcada.' },
      { type: 'sazonal', angle: 'Verão (tosa), inverno (roupinha), Natal', example: 'Kit "verão do pet" com tosa + antipulgas + brinquedo aquático.' },
      { type: 'institucional', angle: 'Bastidor e cuidado', example: 'Rotina da tosadora, veterinário atendendo, pets em recuperação.' },
      { type: 'evento', angle: 'Dia da adoção / pet day', example: 'Evento de adoção no sábado com inscrição = leads de tutores novos.' },
    ],
  },
  automotivo: {
    icon: Car, accent: '#64748b',
    headline: 'Ticket alto, decisão técnica. Prova visual + autoridade.',
    campaigns: [
      { type: 'institucional', angle: 'Bastidor da oficina / mecânico especialista', example: 'Série "por trás do reparo" mostrando diagnóstico e resultado.' },
      { type: 'promocional', angle: 'Revisão de fim de ano', example: '"Antes da viagem: check-up completo por R$ X" em novembro.' },
      { type: 'sazonal', angle: 'Férias, fim de ano, chuva', example: 'Pacote "carro pronto pra chuva" com pneu + palheta + freio.' },
      { type: 'lancamento', angle: 'Novo serviço (blindagem, PPF)', example: 'Reveal com antes/depois + primeiros clientes com preço fundador.' },
    ],
  },
  veiculos: {
    icon: CarFront, accent: '#0ea5e9',
    headline: 'Ticket altíssimo + decisão emocional. Test-drive vende.',
    campaigns: [
      { type: 'lancamento', angle: 'Novo modelo chegou', example: 'Teaser 10 dias + reveal + test-drive agendado por WhatsApp.' },
      { type: 'promocional', angle: 'Feirão / condição especial', example: 'Feirão de fim de semana com entrada + parcelas atrativas.' },
      { type: 'evento', angle: 'Test-drive weekend', example: 'Fim de semana de test-drive com inscrição = leads quentes.' },
      { type: 'institucional', angle: 'Bastidor da loja + pós-venda', example: 'Entrega do carro, cliente feliz, revisão de cortesia.' },
    ],
  },
  imoveis: {
    icon: Home, accent: '#10b981',
    headline: 'Ciclo longo. Autoridade + tour + visita presencial fecham.',
    campaigns: [
      { type: 'institucional', angle: 'Corretor-personagem + região', example: 'Série "conheça o bairro X" com corretor mostrando comércio, escola, transporte.' },
      { type: 'lancamento', angle: 'Novo empreendimento', example: 'Lançamento com lista VIP → tour agendado → oferta de tabela zero.' },
      { type: 'promocional', angle: 'Condição do mês', example: '"Comprou em outubro? Documentação por nossa conta."' },
      { type: 'evento', angle: 'Open house / visita coletiva', example: 'Open house no sábado com inscrição prévia = leads qualificados.' },
    ],
  },
  agropecuaria: {
    icon: Sprout, accent: '#84cc16',
    headline: 'Timing do ciclo agrícola é rei. Fala no momento certo do produtor.',
    campaigns: [
      { type: 'agro', angle: 'Janela de plantio / safra', example: 'Pré-plantio soja: leitura de mercado + dor com percevejo + solução aplicada + depoimento no talhão + condição barter.' },
      { type: 'sazonal', angle: 'Feiras e datas do agro', example: 'Show Rural, Agrishow, Dia do Agricultor — presença + convite + cobertura.' },
      { type: 'evento', angle: 'Dia de campo / feira interna', example: 'Dia de campo na revenda com inscrição = leads de produtores da região.' },
      { type: 'institucional', angle: 'Autoridade técnica do consultor', example: 'Série "pergunta do produtor" respondida pelo agrônomo no talhão.' },
    ],
  },
  construcao: {
    icon: HardHat, accent: '#f97316',
    headline: 'Obra é planejada. Vende quem aparece na hora do projeto.',
    campaigns: [
      { type: 'promocional', angle: 'Combo material da etapa (fundação/acabamento)', example: '"Kit fundação: cimento + areia + brita com 12% off" pra quem vai começar obra.' },
      { type: 'sazonal', angle: 'Início de ano (projeto novo) e pós-chuva', example: 'Janeiro: campanha "hora de tirar do papel" com desconto na primeira compra.' },
      { type: 'institucional', angle: 'Autoridade do vendedor técnico', example: 'Série "pergunte ao engenheiro" com dúvidas de acabamento.' },
      { type: 'evento', angle: 'Feira de fornecedores / dia do pedreiro', example: 'Dia do pedreiro com brindes + inscrição = base de profissionais indicadores.' },
    ],
  },
  odontologia: {
    icon: Smile, accent: '#38bdf8',
    headline: 'Estética + saúde. Antes/depois humanizado + autoridade.',
    campaigns: [
      { type: 'institucional', angle: 'Casos reais (com autorização)', example: 'Antes/depois de clareamento, lente, alinhador.' },
      { type: 'promocional', angle: 'Avaliação gratuita / pacote', example: '"Avaliação + raio-x grátis nesta semana" — Stories diários da agenda.' },
      { type: 'lancamento', angle: 'Nova tecnologia', example: 'Reveal do novo equipamento + primeiros 10 pacientes com condição.' },
      { type: 'sazonal', angle: 'Volta às aulas (crianças) / pré-casamento', example: '"Sorriso pronto pro sim" — pacote noiva 6 meses antes.' },
    ],
  },
  otica: {
    icon: Glasses, accent: '#6366f1',
    headline: 'Óculos é acessório + saúde. Look + prova social vendem.',
    campaigns: [
      { type: 'promocional', angle: '2ª armação com desconto', example: '"Comprou 1, leva a segunda com 40% off" durante a semana.' },
      { type: 'lancamento', angle: 'Nova coleção de armações', example: 'Reveal de coleção + try-on da vendedora + reserva por WhatsApp.' },
      { type: 'sazonal', angle: 'Verão (solares) / volta às aulas (grau infantil)', example: '"Solar do verão" em outubro; "grau infantil escolar" em janeiro.' },
    ],
  },
  joalheria: {
    icon: Gem, accent: '#eab308',
    headline: 'Peça atemporal + presente com significado.',
    campaigns: [
      { type: 'sazonal', angle: 'Dia das Mães, Namorados, Natal', example: 'Guia "presente perfeito" com 3 peças por faixa de preço.' },
      { type: 'lancamento', angle: 'Coleção nova / peça exclusiva', example: 'Editorial de coleção + reserva antecipada VIP.' },
      { type: 'institucional', angle: 'Bastidor da manufatura', example: 'Ourives trabalhando, história da peça, garantia vitalícia.' },
    ],
  },
  turismo: {
    icon: Plane, accent: '#0ea5e9',
    headline: 'Vende sonho e experiência. Vídeo aspiracional + prazo bom.',
    campaigns: [
      { type: 'promocional', angle: 'Feirão de pacotes', example: 'Semana de ofertas: 5 destinos com parcelamento estendido.' },
      { type: 'sazonal', angle: 'Alta temporada + feriadão', example: 'Kit feriadão de 3 dias com hospedagem + traslado.' },
      { type: 'lancamento', angle: 'Novo destino / novo roteiro', example: 'Reveal de roteiro com vídeo do destino + lista de espera.' },
      { type: 'evento', angle: 'Live com influenciador local do destino', example: 'Live tirando dúvidas do destino = leads quentes.' },
    ],
  },
  infantil: {
    icon: ToyBrick, accent: '#f472b6',
    headline: 'Emoção da criança + praticidade do pai. Dupla decisão.',
    campaigns: [
      { type: 'sazonal', angle: 'Dia das Crianças, Natal, volta às aulas', example: 'Guia "top brinquedos por idade" em setembro/outubro.' },
      { type: 'promocional', angle: 'Combo festa / kit mesada', example: 'Kit festa temática por R$ X — Stories da montagem.' },
      { type: 'lancamento', angle: 'Nova linha / personagem em alta', example: 'Chegou coleção do personagem X — reserva por WhatsApp.' },
    ],
  },
  moveis: {
    icon: Sofa, accent: '#a78bfa',
    headline: 'Compra planejada, ticket alto. Ambiente montado + condição no boleto.',
    campaigns: [
      { type: 'lancamento', angle: 'Nova linha / ambiente completo', example: 'Reveal do ambiente montado em vídeo 360 + reserva no WhatsApp.' },
      { type: 'promocional', angle: 'Feirão do sofá / semana do quarto', example: '"Semana do quarto: cama + colchão + guarda-roupa por R$ X em 24x."' },
      { type: 'sazonal', angle: 'Casa nova (janeiro/julho), Natal, mudança', example: 'Janeiro: "casa nova, ambiente novo" com combo sala completa.' },
      { type: 'institucional', angle: 'Bastidor da fábrica / entrega', example: 'Cliente recebendo, montagem, satisfação após 6 meses.' },
    ],
  },
  clinica_veterinaria: {
    icon: VetIcon, accent: '#22c55e',
    headline: 'Confiança do tutor + prova de cuidado. Recorrência mensal.',
    campaigns: [
      { type: 'sazonal', angle: 'Vacinação anual + estações', example: 'Campanha anual de vacinação em março + antipulgas no verão.' },
      { type: 'institucional', angle: 'Vet-personagem + rotina', example: 'Rotina do vet, cirurgias com sucesso, pets em recuperação.' },
      { type: 'promocional', angle: 'Pacote check-up preventivo', example: 'Check-up completo por R$ X em janeiro (preventiva anual).' },
      { type: 'evento', angle: 'Palestra "pet saudável"', example: 'Palestra online sobre nutrição pet = leads de tutores.' },
    ],
  },
  limpeza: {
    icon: SprayCan, accent: '#0ea5e9',
    headline: 'Recompra frequente. Ganha quem entra na rotina do cliente.',
    campaigns: [
      { type: 'promocional', angle: 'Combo faxina completa', example: 'Kit faxina (multiuso + amaciante + desinfetante) com 20% off.' },
      { type: 'institucional', angle: 'Prova de eficácia', example: 'Reels antes/depois com produto em uso real.' },
      { type: 'sazonal', angle: 'Pré-verão / pós-carnaval / mudança', example: '"Casa pronta pro verão" em setembro com kit desengordurante.' },
    ],
  },
  grafica: {
    icon: Printer, accent: '#e879f9',
    headline: 'B2B recorrente. Vende quem entrega qualidade e prazo.',
    campaigns: [
      { type: 'institucional', angle: 'Portfólio + bastidor da produção', example: 'Série "hoje na gráfica" mostrando trabalhos saindo da impressora.' },
      { type: 'sazonal', angle: 'Fim de ano corporativo / eventos', example: 'Novembro: brindes corporativos e calendários com condição por lote.' },
      { type: 'promocional', angle: 'Combo cartão + banner + adesivo', example: 'Kit "abertura de loja" com 3 produtos por R$ X.' },
    ],
  },
  juridico: {
    icon: Landmark, accent: '#64748b',
    headline: 'Autoridade + didática. Explica direito em linguagem de gente.',
    campaigns: [
      { type: 'institucional', angle: 'Advogado-professor', example: 'Reels "3 direitos que você não sabia" toda semana → CTA consulta.' },
      { type: 'evento', angle: 'Live de dúvidas jurídicas', example: 'Live mensal respondendo pergunta dos comentários = base de leads.' },
      { type: 'sazonal', angle: 'Datas fiscais / IR / novas leis', example: 'Março: "IR sem susto" — post explicativo + CTA de consulta.' },
    ],
  },
  contabilidade: {
    icon: Calculator, accent: '#38bdf8',
    headline: 'Vende quem economiza imposto e simplifica. Autoridade em linguagem simples.',
    campaigns: [
      { type: 'institucional', angle: 'Explica regime tributário sem jargão', example: 'Série "Simples ou Lucro Presumido?" com exemplos reais.' },
      { type: 'evento', angle: 'Webinar para novos MEIs / abertura de CNPJ', example: 'Webinar "abrindo seu CNPJ" → captura leads de futuros clientes.' },
      { type: 'sazonal', angle: 'IR, DEFIS, fechamento anual', example: 'Fevereiro-abril: campanha "IR sem dor de cabeça".' },
    ],
  },
  outro: {
    icon: Package, accent: '#94a3b8',
    headline: 'Sem nicho definido — comece pelo institucional pra descobrir o ângulo que vende.',
    campaigns: [
      { type: 'institucional', angle: 'Descobrir a promessa central', example: 'Série de 4 vídeos: quem somos, o que fazemos, pra quem, resultado esperado.' },
      { type: 'promocional', angle: 'Primeira oferta pra testar mercado', example: 'Oferta de entrada com condição diferenciada pra medir conversão.' },
      { type: 'evento', angle: 'Live/aula aberta para conhecer o público', example: 'Live gratuita sobre a área = leads e feedback sobre a dor real.' },
    ],
  },
};

/**
 * Retorna a sugestão de um nicho ou um fallback genérico caso ainda não exista mapeamento.
 */
export function getNicheSuggestion(niche: string): NicheSuggestion {
  return NICHE_CAMPAIGN_SUGGESTIONS[niche] || NICHE_CAMPAIGN_SUGGESTIONS.outro;
}

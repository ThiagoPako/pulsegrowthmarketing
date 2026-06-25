import { Rocket, Zap, Briefcase, Trophy, LucideIcon } from 'lucide-react';

export type Plan = {
  key: 'starter' | 'boost' | 'premium' | 'elite';
  name: string;
  icon: LucideIcon;
  tagline: string;
  description: string;
  highlight?: boolean;
  badge?: string;
  features: string[];
  pricing: { label: string; monthly: string; save?: string }[];
  ideal: string;
};

export const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Pulse Starter',
    icon: Rocket,
    tagline: 'Comece com base profissional',
    description: 'Ideal para empresas estruturando sua presença digital com segurança e consistência.',
    ideal: 'Empresas iniciando no digital que precisam de uma base sólida e profissional.',
    features: [
      'Linha editorial estratégica',
      'Implementação gratuita de contas de anúncios',
      '2 artes para feed e stories',
      '4 reels mensais para alcance',
      'Gestão de tráfego pago Meta Ads',
      'Dashboard de resultados em tempo real',
      'Edição profissional de vídeo',
      'Direcionamento estratégico de gravação',
      '2 criativos em vídeo para anúncios (15–20s)',
      'Acesso ao Portal do Cliente',
      'Relatórios mensais baseados em dados',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 2.680' },
      { label: '12 meses', monthly: 'R$ 2.400', save: 'Economia de R$ 3.360' },
    ],
  },
  {
    key: 'boost',
    name: 'Pulse Boost',
    icon: Zap,
    tagline: 'O plano que mais entrega resultado',
    description: 'O equilíbrio perfeito entre volume de produção, estratégia avançada e investimento inteligente. É o plano que recomendamos para quem quer crescer de verdade.',
    highlight: true,
    badge: '⭐ Plano recomendado',
    ideal: 'Empresas que querem acelerar crescimento com produção robusta, presença diária e estratégia avançada — sem pagar o ticket de planos enterprise.',
    features: [
      'Linha editorial com análise estratégica',
      'Criação de campanhas sazonais',
      'Reformulação completa de perfil (foto + 6 posts + destaques)',
      'Implementação gratuita de contas de anúncios',
      '2 posts mensais em arte',
      'Análise estratégica de público-alvo',
      'Criação de roteiros profissionais',
      '20 stories/mês com distribuição semanal',
      'Edição profissional de vídeo',
      '6 reels mensais para expansão',
      '4 criativos em vídeo para anúncios',
      '4 artes mensais de apoio',
      'Social media dedicado',
      'Google Ads + Meta Ads',
      'Google Meu Negócio monitorado',
      'Portal do Cliente + Relatórios mensais',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 3.280' },
      { label: '12 meses', monthly: 'R$ 2.900', save: 'Economia de R$ 4.560' },
    ],
  },
  {
    key: 'premium',
    name: 'Pulse Premium',
    icon: Briefcase,
    tagline: 'Autoridade + foco em vendas',
    description: 'Integra conteúdo, mídia paga e inteligência comercial para performance em alto nível.',
    ideal: 'Marcas estabelecidas que querem autoridade no mercado e estratégia comercial integrada.',
    features: [
      'Linha editorial com análise estratégica',
      'Implementação gratuita de contas de anúncios',
      'Análise estratégica de público-alvo',
      'Roteiros profissionais',
      '20 stories/mês distribuídos',
      'Edição profissional de vídeo',
      '8 reels mensais (2x/semana)',
      '6 artes mensais',
      'Social media dedicado',
      'Google Ads + Meta Ads avançado',
      'Google Meu Negócio monitorado',
      'Dashboard em tempo real',
      'Campanhas comerciais e estratégias de vendas',
      'Datas sazonais acompanhadas',
      'CRM integrado: Facebook + Instagram + WhatsApp',
      'Treinamento comercial para equipe de vendas',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 4.680' },
      { label: '12 meses', monthly: 'R$ 4.200', save: 'Economia de R$ 5.760' },
    ],
  },
  {
    key: 'elite',
    name: 'Pulse Elite',
    icon: Trophy,
    tagline: 'Domine o mercado',
    description: 'Operação digital completa, orientada a escala, presença e acompanhamento avançado.',
    badge: 'Top performance',
    ideal: 'Empresas que querem dominância de marca, escala máxima e operação digital completa.',
    features: [
      'Tudo do Premium +',
      '12 reels mensais (3x/semana)',
      '8 artes mensais',
      'Google + Meta Ads avançado premium',
      'Monitoramento avançado de CRM com análise de atendimento',
      'Grupo de WhatsApp dedicado com time de vendas',
      'Gerenciamento de relacionamentos com influenciadores',
      'Treinamento comercial recorrente',
    ],
    pricing: [
      { label: '6 meses', monthly: 'R$ 6.500' },
      { label: '12 meses', monthly: 'R$ 5.850', save: 'Economia de R$ 7.800' },
    ],
  },
];

export const getPlan = (key: string) => PLANS.find((p) => p.key === key);

export const BRIEFING_FIELD_LABELS: Record<string, string> = {
  ownerName: 'Nome do responsável',
  niche: 'Nicho de atuação',
  mainDifferential: 'Principal diferencial',
  productsServices: 'Produtos / Serviços',
  businessGoals: 'Objetivos do negócio',
  attendanceType: 'Forma de atendimento',
  targetCities: 'Cidades-alvo',
  hasVisualIdentity: 'Possui identidade visual?',
  hasSite: 'Possui site?',
  competitors: 'Principais concorrentes',
  digitalReferences: 'Referências digitais',
  nicheReferences: 'Referências do nicho',
  dislikedCommunication: 'Comunicação que não gosta',
  socialObjectives: 'Objetivos nas redes sociais',
  digitalDifficulty: 'Maior dificuldade no digital',
  socialLinks: 'Links das redes sociais',
  importantTopics: 'Assuntos importantes',
  comfortOnCamera: 'Conforto diante da câmera',
  focusProducts: 'Produtos / serviços em foco',
  businessDifficulty: 'Maior dificuldade no negócio',
  desiredRecognition: 'Como deseja ser reconhecido',
  undesiredRecognition: 'Como não deseja ser reconhecido',
  contentReferences: 'Referências de conteúdo',
  keywords: 'Palavras-chave',
  ageRangesTarget: 'Faixa etária do público-alvo',
  ageRangesBuyer: 'Faixa etária de quem compra',
  isAuthority: 'É autoridade no nicho?',
  educationLevel: 'Escolaridade do público',
  socialClass: 'Classe social',
  clientUsesSocial: 'O cliente usa redes sociais?',
  idealClient: 'Cliente ideal',
  finalNotes: 'Considerações finais',
  instagramExists: 'Já possui Instagram?',
  instagramProfile: 'Perfil ou link do Instagram',
  instagramLogin: 'Instagram — login',
  instagramPassword: 'Instagram — senha',
  facebookPageExists: 'Já possui página no Facebook?',
  facebookPage: 'Nome ou link da página do Facebook',
  facebookLogin: 'Facebook — login',
  facebookPassword: 'Facebook — senha',
  otherAccesses: 'Outros acessos e observações',
  cities: 'Cidades de atuação',
  plans: 'Planos atuais e valores',
  teamVideos: 'Vídeos com a equipe',
  teamVideosDetails: 'Observações sobre vídeos da equipe',
  marketingChannels: 'Canais de marketing já utilizados',
  influencerBudget: 'Verba para blogueiras e influenciadores',
  externalMarketingBudget: 'Verba para marketing externo',
  metaAdsBudget: 'Orçamento inicial para anúncios Meta',
  targetAudience: 'Público-alvo',
  currentDifficulties: 'Dores e desafios atuais',
  growthGoals: 'Objetivos de crescimento',
  visualIdentity: 'Identidade visual e materiais',
  additionalNotes: 'Informações complementares',
  business_description: 'Descrição do negócio',
  target_audience: 'Público-alvo',
  differentials: 'Diferenciais',
  tone_of_voice: 'Tom de voz',
  goals: 'Objetivos',
  visual_references: 'Referências visuais',
  brand_colors: 'Cores da marca',
  avoid: 'Evitar',
  additional_notes: 'Observações adicionais',
  products_services: 'Produtos / Serviços',
  social_media_links: 'Redes sociais',
};

const VALUE_LABELS: Record<string, string> = {
  sim: 'Sim',
  nao: 'Não',
  sim_todos: 'Sim, todos os colaboradores',
  sim_alguns: 'Sim, apenas alguns setores',
  a_decidir: 'Ainda será definido',
  blogueiras: 'Blogueiras / Influenciadores',
  outdoors: 'Outdoors / Mídia exterior',
  panfletagem: 'Panfletagem / Flyers',
  radio: 'Rádio / TV local',
  eventos: 'Patrocínio de eventos',
  indicacao: 'Indicação / Boca a boca',
  meta_ads: 'Anúncios no Facebook e Instagram',
  google_ads: 'Anúncios no Google',
  nenhum: 'Ainda não investe em marketing',
};

export function getBriefingFieldLabel(key: string): string {
  return BRIEFING_FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatBriefingValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    const values = value.filter((item) => item != null && item !== '').map((item) => VALUE_LABELS[String(item)] || String(item));
    return values.length ? values.join(', ') : '—';
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return VALUE_LABELS[String(value)] || String(value);
}
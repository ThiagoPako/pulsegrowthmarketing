// Funções das chaves de agente (vps-api-server/agentRoutes.mjs AGENT_ROLES). Mude os dois lados juntos.
export const AGENT_ROLE_LABELS: Record<string, string> = {
  editor: 'Editor',
  revisor: 'Revisão',
  chefe: 'Chefe',
  // agentes de design (Kanban de Design): criam artes / revisam artes na coluna Análise IA
  designer: 'Designer',
  revisor_arte: 'Revisão de artes',
  // varre o Drive dos clientes e abre cards de Edição e de Design (agentTriageRoutes.mjs)
  triagem: 'Triagem do Drive',
  // apoio da edição (desde 31/10/2026): não pegam card; trabalham no projeto do editor e mandam etapa no card
  colorista: 'Colorista (cor)',
  som: 'Som (sound designer)',
  // Victoria (desde 01/11/2026): escreve roteiros no módulo Copy; não pega card (victoriaRoutes.mjs)
  roteirista: 'Roteirista (Copy)',
  // Ísis (desde 01/11/2026): social media; datas sazonais, relatório mensal, campanhas e cobranças; não pega card
  social_media: 'Social media',
};

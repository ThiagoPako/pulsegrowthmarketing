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
};

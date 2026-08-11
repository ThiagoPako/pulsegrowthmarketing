# Plano de Implementação: Coletador de Leads CRM (API de Empresas)

Adicionar a funcionalidade de "Colheita de Leads" ao módulo CRM, permitindo a prospecção ativa de empresas através de filtros de localização, nicho e capital social, com integração direta ao pipeline de vendas.

## Alterações Técnicas

### Backend (VPS API Server)
- **Tabela `crm_leads`**:
  - Adicionar colunas `source_tag` (texto) e `referral_info` (JSONB).
  - A coluna `source_tag` armazenará "colheita" ou o nome do indicador.
- **API Mock/Proxy**:
  - Criar endpoint `POST /api/crm/harvest/search` para simular/integrar com API de empresas (CNPJs).
  - Filtros: `city`, `niche`, `min_capital`.
  - Retorno: `razao_social`, `contato`, `email`, `telefone`, `atuacao`, `endereco`, `capital_social`.

### Frontend
- **Novo Componente `LeadHarvester.tsx`**:
  - Interface de busca com filtros e exibição em cards.
  - Botão "Adicionar como Lead" que dispara a mutação `createLead` com a tag "colheita".
- **Página `CRM.tsx`**:
  - Nova aba "Colheita de Leads".
  - Exibição da tag de origem nos cards do Kanban.
  - Modificar formulário "Novo Lead" para incluir campos de indicação (nome e observações do indicador) quando a origem for indicação.
- **Tipagem**:
  - Atualizar `Lead` em `src/types/index.ts` e `src/pages/CRM.tsx`.

### Segurança e RLS (Emulado na VPS)
- Garantir que a tag de origem seja persistente e não editável por usuários sem permissão `admin`.

---

## Technical Details
- **API Simulation**: Uses a curated mock dataset for the "Empresa" search to demonstrate the functionality before real API key integration.
- **Persistence**: The `source_tag` will be a column in the `crm_leads` table, ensuring it stays with the lead throughout the entire sales funnel.
- **WebSocket**: Global notification for when a harvested lead is converted into a contract.

---

## User Review Required
> [!IMPORTANT]
> A busca de empresas será feita por uma API mockada inicialmente. Para integração real (ex: API da Receita Federal ou similar), será necessário configurar credenciais na VPS futuramente.

Ao finalizar, enviarei o comando completo para deploy na VPS.

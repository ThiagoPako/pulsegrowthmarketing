# Plano de Implementação: Transferência de Cliente por Etapas (Módulo Clientes)

O objetivo é transformar o processo de transferência de cidade no módulo de Clientes em um fluxo guiado por etapas (stepper), garantindo segurança dos dados e visibilidade do progresso.

## 1. Interface do Usuário (UI Architect)
- **Componente**: `TransferClientDialog.tsx`
- **Novo Fluxo de Etapas**:
  1. **Segurança**: Introdução e preparação ("Garantir segurança dos dados").
  2. **Validação**: Checklist automático de registros (histórico, financeiro, etc.).
  3. **Configuração**: Seleção da cidade de destino.
  4. **Execução**: Barra de progresso real enquanto os dados são movidos no backend.
- **Visual**: Uso de ícones de status, barra de progresso do Shadcn/UI e transições suaves entre estados.

## 2. Lógica e Backend (Supabase Engineer / API Integrator)
- **Simulação de Progresso**: Como a transferência no PostgreSQL é atômica (transação), implementaremos uma simulação visual de progresso baseada no volume de dados (`total_records`) para dar feedback ao usuário.
- **Endpoints**:
  - `GET /api/clients/:id/transfer-preview`: Já existente, será usado na etapa de Validação.
  - `PUT /api/clients/:id`: Execução final.

## 3. Detalhes Técnicos
- **Estado**: Gerenciamento do `step` atual e dos dados de `preview`.
- **Headers**: Manutenção da injeção de `x-pulse-city` em todas as etapas para evitar erros de contexto.
- **Resiliência**: Tratamento de erros em cada etapa com opção de "Voltar" ou "Tentar novamente".

## 4. Deploy (Deploy Ops)
- Atualização do servidor `pulse-api` na VPS para suportar a nova estrutura se necessário.
- Comando de deploy padrão para sincronizar frontend.
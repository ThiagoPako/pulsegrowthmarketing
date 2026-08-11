# Plano de Melhorias CRM - Pulse Growth Marketing

O objetivo é transformar o CRM em uma ferramenta mais robusta e colaborativa, adicionando suporte a leads perdidos, notificações em tempo real para toda a equipe e atalhos de comunicação.

## Alterações Técnicas

### 1. Banco de Dados (VPS)
- Adicionar colunas `description` (TEXT) e `city` (TEXT) à tabela `crm_leads`.
- Criar migração SQL para aplicar na VPS.

### 2. Backend (server.mjs)
- Atualizar o endpoint de criação/atualização de leads para aceitar os novos campos.
- Implementar o disparo de eventos via WebSocket quando o status mudar para `meeting` ou `contracted`.

### 3. Frontend
- **Interface CRM**: Adicionar a coluna "Leads Desistentes" e estilizar a coluna "Contrato Fechado" com destaque (ex: borda dourada/brilhante).
- **Cadastro**: Incluir campos de cidade e descrição no formulário de "Novo Lead".
- **Card**: Adicionar ícone do WhatsApp que abre `wa.me/` com o número do lead.
- **Notificações**: Configurar o `AppContext` ou um listener global para captar eventos de "Novo Cliente" e "Reunião Agendada" vindos da VPS e exibir Toasts para todos os usuários.

## Guia para o Usuário
Após a implementação, será necessário rodar a migração na VPS. O comando de deploy completo será fornecido para garantir que o banco e o servidor API reflitam as mudanças.

---

### Detalhes Técnicos (Para Desenvolvedores)
- **Tabela**: `crm_leads`
- **Novos Estados**: `lost` (Desistentes)
- **Eventos WS**: `crm:meeting_scheduled`, `crm:contract_signed`

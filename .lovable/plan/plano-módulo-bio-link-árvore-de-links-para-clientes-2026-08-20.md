# Plano: Módulo Bio Link (Árvore de Links) para Clientes

Este plano detalha a implementação de um módulo para criar páginas de "Link na Bio" personalizáveis para os clientes, permitindo cadastrar múltiplos números de WhatsApp, localização e outros links essenciais.

## O que será construído
1.  **Backend (VPS API)**:
    *   Novas tabelas `client_bio_links` e `client_bio_buttons` no banco de dados local da VPS.
    *   Endpoints de CRUD para gerenciamento das bios e botões.
    *   Endpoint público para visualização da bio sem login.
2.  **Frontend (Área Administrativa)**:
    *   Interface de gerenciamento em `/bio-links` para criar, editar e excluir bios.
    *   Formulário para configurar múltiplos números de WhatsApp, link de localização (Google Maps), redes sociais e personalização visual (cores, logo).
    *   Geração de link público encurtado.
3.  **Frontend (Página Pública)**:
    *   Nova rota pública `/b/:slug` (ou `/bio/:slug`) otimizada para dispositivos móveis.
    *   Design limpo e moderno com botões de ação rápida (WhatsApp, Localização, etc.).
    *   Tracking de cliques integrado.

## Detalhes Técnicos
*   **Database**:
    *   `client_bio_links`: `id`, `client_id`, `slug`, `title`, `description`, `logo_url`, `theme_config` (JSONB), `city`, `created_at`, `updated_at`.
    *   `client_bio_buttons`: `id`, `bio_link_id`, `label`, `type` (whatsapp, location, social, custom), `value` (número, url), `icon`, `position`, `active`.
*   **Segurança**:
    *   Acesso administrativo restrito por `role` (admin, social_media).
    *   Isolamento por cidade (`city`) seguindo as regras de multi-tenant do projeto.
    *   Página pública acessível apenas via slug único.
*   **Design**:
    *   Interface administrativa seguindo o padrão Shadcn/UI do projeto.
    *   Página pública responsiva, estilo "Apple-like minimal" conforme as diretrizes de design.

## Próximos Passos
1.  Criar as tabelas na VPS e liberar no `ALLOWED_TABLES`.
2.  Desenvolver os hooks e serviços de API no frontend.
3.  Implementar a interface de gerenciamento.
4.  Criar a página pública de visualização.

# Pulse Growth Marketing — Sistema de Gestão

Sistema completo de gestão para agências de marketing digital, com módulos para produção de conteúdo, design, endomarketing, financeiro e integração WhatsApp.

## 🛠️ Stack Tecnológica

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui + Framer Motion
- **Backend**: Lovable Cloud (Supabase) — PostgreSQL, Auth, Storage, Edge Functions
- **Estado**: React Query + Context API
- **Integrações**: WhatsApp (AtendeClique API)

## 📦 Instalação

```bash
# Clonar o repositório
git clone <URL_DO_REPOSITORIO>
cd <NOME_DO_PROJETO>

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Preencher com as credenciais do projeto

# Iniciar servidor de desenvolvimento
npm run dev
```

## 🧪 Testes

```bash
npm test           # Executar testes
npm run test:watch # Modo watch
```

## 🏗️ Build de Produção

```bash
npm run build    # Gera /dist otimizado com minificação e tree-shaking
npm run preview  # Pré-visualizar build localmente
```

## 📁 Estrutura do Projeto

```
src/
├── components/       # Componentes reutilizáveis (UI, layout, módulos)
│   ├── ui/           # shadcn/ui components
│   ├── designer/     # Módulo Designer
│   ├── content/      # Módulo Conteúdo
│   ├── editor/       # Módulo Editor
│   ├── endomarketing/# Módulo Endomarketing
│   └── social/       # Módulo Social Media
├── contexts/         # Context API (AppContext)
├── hooks/            # Custom hooks (auth, data, auto-save)
├── integrations/     # Supabase client e types (auto-gerado)
├── lib/              # Utilitários e helpers
├── pages/            # Páginas/rotas da aplicação
├── services/         # Serviços externos (WhatsApp)
├── test/             # Configuração de testes
└── types/            # Definições de tipos TypeScript

supabase/
└── functions/        # Edge Functions (serverless)
```

## 🔐 Módulos e Permissões

| Papel          | Acesso                                            |
|----------------|---------------------------------------------------|
| Admin          | Acesso total a todos os módulos                   |
| Social Media   | Gestão operacional, clientes, conteúdo, agenda    |
| Videomaker     | Dashboard de gravações e produtividade            |
| Editor         | Dashboard e kanban de edição                      |
| Designer       | Kanban de design e relatórios                     |
| Fotógrafo      | Kanban de design (perfil visual)                  |
| Endomarketing  | Módulo de endomarketing completo                  |
| Parceiro       | Painel do parceiro com visibilidade financeira    |

## 📄 Licença

Projeto privado — uso restrito.

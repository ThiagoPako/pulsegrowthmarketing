# Plano de Implementação: Gestão de Estrutura e Almoxerifado

O objetivo é aprimorar o módulo financeiro para identificar gastos com estrutura e criar um novo módulo de Almoxerifado para gestão de equipamentos e ativos físicos.

## Alterações Técnicas

### 1. Banco de Dados (Backend VPS)
- Criar a tabela `warehouse_items` para o Almoxerifado.
- Adicionar suporte a categorias de "Estrutura" no financeiro.
- Garantir que gastos com estrutura sejam identificáveis na tabela `expenses`.

### 2. Módulo de Almoxerifado (Frontend)
- Criar a página `Warehouse.tsx` para gerenciar equipamentos.
- Funcionalidades: Cadastro de item, Tag (QR Code/ID), Responsável (vinculado a `profiles`), Tipo de Equipamento.
- Filtros e busca.

### 3. Integração Financeira
- Adicionar uma nova aba ou filtro no `FinancialExpenses.tsx` para "Estrutura da Empresa".
- Permitir que ao cadastrar uma despesa, ela possa ser marcada como "Investimento em Estrutura".

## Detalhes Técnicos

### Esquema da Tabela `warehouse_items`:
```sql
CREATE TABLE IF NOT EXISTS warehouse_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- Ex: Equipamento, Mobiliário, Ferramenta
    tag_id TEXT UNIQUE, -- Código de identificação ou patrimônio
    responsible_id UUID REFERENCES auth_users(id),
    status TEXT DEFAULT 'em_uso', -- Ex: em_uso, manutencao, disponivel, descartado
    purchase_date DATE,
    purchase_price NUMERIC,
    expense_id UUID REFERENCES expenses(id), -- Link opcional com a despesa financeira
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Alterações no Financeiro:
- No `ExpenseFormDialog.tsx`, adicionar um checkbox ou toggle: "Gasto com Estrutura/Investimento".
- Criar uma categoria padrão "Estrutura/Investimento" se não existir.

## User Experience (UX)
- Navegação: Novo item no menu lateral "Almoxerifado" (Administrativa).
- Visual: Cards modernos para equipamentos com status colorido.
- Financeiro: Dashboard mostrará o total investido em estrutura no período selecionado.

## Próximos Passos
1. Atualizar o `server.mjs` com as novas tabelas e endpoints.
2. Criar o componente `Warehouse.tsx`.
3. Ajustar `FinancialDashboard.tsx` e `FinancialExpenses.tsx`.
4. Adicionar a rota em `App.tsx` e `Layout.tsx`.

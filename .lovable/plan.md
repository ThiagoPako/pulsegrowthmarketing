# Plano: Ofertas Granulares em Planos Anuais (Contrato 6+6)

Implementação de suporte a ofertas de "preço promocional por X meses e preço normal nos demais" para planos anuais na apresentação de planos.

## User Review Required

> [!IMPORTANT]
> A implementação assume que a tabela `plan_promotions` na VPS já possui a coluna `duration_months`. O sistema agora tratará o valor promocional como aplicável apenas durante esse período, exibindo o valor normal para os meses restantes do contrato anual.

## Mudanças Propostas

### Backend (VPS API Server)
- Garantir que a tabela `plan_promotions` suporte `duration_months` (já referenciado no código atual, mas será validado/reforçado).

### Frontend
- **Apresentação de Plano (`ApresentacaoPlano.tsx`):**
    - Atualizar a lógica de cálculo de economia para considerar o cenário de "X meses promo + Y meses normal".
    - Melhorar a UI do `StageInvest` para mostrar explicitamente a transição de valores (ex: "R$ 1.900 nos primeiros 6 meses, R$ 2.400 nos demais").
    - Adicionar um aviso visual claro sobre a duração da oferta no card do plano anual.

## Detalhes Técnicos
- Modificação na função `useMemo` de `pricing` para calcular `totalAnual` como `(promoAnualMes * duration) + (valorNormal * (12 - duration))`.
- Atualização do componente `StageInvest` para exibir a decomposição do valor anual.
- Atualização do cabeçalho de deploy em `src/routes/index.tsx`.

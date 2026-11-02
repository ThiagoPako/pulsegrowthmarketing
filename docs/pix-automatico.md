# Pix Automático e avisos de dinheiro à equipe

Pedido do usuário (02/11/2026):
- **Pix Automático:** dar a opção em todas as cobranças, avisando que dá para cancelar a qualquer momento e que o débito é só no vencimento.
- **Quem aderiu:** não recebe cobrança. Recebe só o PDF do dia 1 e o PDF perto do vencimento, sem cobrança. Só é cobrado se o débito não passar.
- **Avisos no WhatsApp:**
  - Minaçu: Thiago e Victor recebem os pagamentos, as adesões e as movimentações da conta.
  - Uruaçu: só o Thiago.

## Pix Automático (jornada 2 da Efí)

Código: `vps-api-server/lib/pixAutomatico.mjs` (regras) e `vps-api-server/pixAutomaticoRoutes.mjs`.
A página fica em `src/pages/PayBilling.tsx` (`PixAutoSection`) e a tela em Financeiro → Pagamentos (`PixAutoPanel`).

1. **Ativação na página /pagar.** O cliente toca em **Ativar Pix Automático** e informa o CPF ou CNPJ e o nome do
   titular da conta. A Pulse cria a location (`POST /v2/locrec`) e a recorrência (`POST /v2/rec`): mensal, sem
   retentativa, no valor do contrato, com o primeiro débito no vencimento do mês seguinte. Em seguida devolve o código
   de `GET /v2/rec/:idRec` (`dadosQR.pixCopiaECola`). O cliente cola no app do banco e autoriza. O documento fica
   cifrado.
2. **Autorização.** De 15 em 15 min a Pulse confere a recorrência. Aprovada, o cliente vira "ativo" e a equipe recebe
   o aviso de adesão. Se o cliente cancelar no banco, a equipe é avisada e a cobrança de sempre volta.
3. **Cobrança de cada mês.** De 2 a 8 dias antes do vencimento a Pulse cria a cobrança recorrente (`POST /v2/cobr`,
   ajustada para dia útil), com a **agência e a conta da Efí** que estão no bloco da Efí da cidade.
4. **Débito.**
   - Pago (`CONCLUIDA` ou tentativa liquidada): a baixa é a mesma das outras formas (receita, caixa e obrigado com recibo).
   - Não debitou (sem saldo, ou o vencimento passou sem pagamento): a cobrança fica como "não debitou", a equipe é avisada
     e a Ísis manda a cobrança de sempre no dia seguinte ao vencimento, dizendo que o débito não passou.
5. **O que a Ísis manda a quem está ativo:**
   - Dia 1: o relatório em PDF, igual a todos.
   - D−5: o PDF e a mensagem avisam que a mensalidade é debitada pelo Pix Automático no vencimento, sem cobrança.
   - Dia D: nada.
   - D+1: a cobrança, só se não debitou.
   - D+3: o lembrete, só se continuar em aberto.
6. **O convite.** A mensagem de cobrança e de lembrete de quem ainda não aderiu termina com uma linha curta sobre o Pix
   Automático, e o PDF da cobrança leva a mesma informação.

Os webhooks de recorrência e de cobrança recorrente (`/v2/webhookrec`, `/v2/webhookcobr`) pedem mTLS no servidor. Até
o mTLS ser configurado, a conferência é feita de 15 em 15 minutos.

## Avisos à equipe (WhatsApp)

O módulo `vps-api-server/lib/teamAlerts.mjs` manda os avisos aos números do Assistente com a permissão
**avisos_pagamentos**. A cidade sai de `assistant_numbers.cities`: o Thiago tem as duas cidades e o Victor só Minaçu.
- **Pagamento de cliente:** sai em toda baixa, com a forma de pagamento (Pix Automático, cartão, Pix da Efí, Pix pela
  chave, comprovante ou baixa no sistema).
- **Pix Automático:** sai na adesão, no cancelamento e quando o débito não passa.
- **Movimentação da conta:**
  - entrada Pix que não virou mensalidade em 15 min;
  - todo Pix enviado (`GET /v2/gn/pix/enviados`).

  Só o que aconteceu nas últimas 3 h vira mensagem; o mais antigo é marcado sem aviso.

# Pix pela chave · comprovante e confirmação

Pedido do usuário (02/11/2026): "para pagamentos Pix vamos adicionar a chave Pix para evitar taxas e crie uma forma de
autenticar esse pagamento para confirmar no sistema que foi pago; as taxas vamos repassar para o cliente sempre com
aquele aviso discreto".

Código: `vps-api-server/lib/pixReceipt.mjs` (regras), `vps-api-server/pixReceiptRoutes.mjs` (rotas),
`src/pages/PayBilling.tsx` (página /pagar) e `src/components/financial/PixReceiptsPanel.tsx` (Financeiro → Pagamentos).

## Como ligar numa cidade

Em Financeiro → Pagamentos, na cidade:
1. preencha a **Chave Pix**, o **Nome do recebedor**, o **CPF ou CNPJ** e o **Banco** da conta que recebe sem taxa;
2. deixe **Cobrar com a Efí** desligado. Ligada, a cidade usa o Pix dinâmico da Efí, que tem taxa por Pix recebido.

O cartão continua pelo link da InfinitePay, que repassa a taxa ao cliente. Na página e no PDF aparece o aviso
discreto: "No cartão de crédito há a taxa da transação, cobrada pela facilitadora de pagamentos. A Pulse não cobra
nenhum valor a mais."

## O que acontece

1. A cobrança leva o Pix copia e cola estático da chave, já com o valor. O identificador (txid) é `PULSE` + aaaamm + os
   8 primeiros caracteres do contrato; alguns bancos mostram esse identificador no app.
2. Depois de pagar, o cliente toca em **Enviar comprovante** na página de pagamento e manda o print ou o PDF (até 8 MB).
3. A IA (Claude) lê o comprovante e o servidor confere cinco coisas:
   - o valor é o da mensalidade;
   - o recebedor é a Pulse (chave, CNPJ mascarado ou nome);
   - o ID da transação tem o formato do Banco Central (E + banco + data e hora + 11 caracteres);
   - a data do Pix combina com a cobrança;
   - o ID não foi usado em outro comprovante.

   O resultado é um destes três:
   - **comprovante bate**: tudo conferiu;
   - **conferir**: alguma coisa não deu para ler;
   - **não bate**: o valor é diferente, o comprovante não é de Pix ou o ID está repetido. O cliente recebe uma mensagem
     curta, sem os detalhes da conferência.
4. **A baixa só sai com o dinheiro visto.** Um print pode ser editado, então o comprovante sozinho não dá baixa. A baixa
   sai de um destes dois jeitos:
   - **Extrato (.ofx)**: em Financeiro → Pagamentos → Comprovantes, toque em **Extrato Minaçu/Uruaçu (.ofx)** e envie o
     extrato exportado do app ou do site do banco. Cada crédito casa sozinho com um comprovante conferido de um destes
     modos:
     - pelo ID da transação, quando ele aparece no extrato;
     - pelo valor, quando há um só comprovante e um só crédito nesse valor, com até 2 dias de diferença.

     Crédito já importado não casa de novo.
   - **Confirmar recebimento**: olhe o app do banco e toque no botão do comprovante.
5. Com a baixa, a receita fica recebida, entra no caixa e o cliente recebe o obrigado com o recibo, a mesma baixa da
   InfinitePay e da Efí.

Os comprovantes ficam fora da pasta pública de uploads (`PRIVATE_FILES_ROOT`, padrão `../pulse-privado` ao lado de
`/var/www/uploads`). Só o admin abre o arquivo. Cada cobrança aceita até 6 envios por dia.

## Conferência na API da Efí (02/11/2026)

Pedido do usuário: "autenticar esses pagamentos pelo nosso sistema, via conferência na API, na hora que o cliente
pagar, confirmar que o pagamento dele bate com o que caiu na conta, assim não pagamos taxa".

Com a conta Efí da cidade **testada**, o sistema confere sozinho, mesmo com "Pix com baixa automática" desligado.
Nesse modo não se gera cobrança na Efí: o sistema só consulta os Pix que caíram na conta (`GET /v2/pix`, `GET /v2/pix/:e2e`).
- **A cada 10 min:** lê os Pix das últimas 48 h. O Pix com o txid `PULSE…` do copia e cola casa com a mensalidade e dá
  baixa se o valor bate.
- **Comprovante enviado:** o Pix é procurado na conta pelo ID da transação. Se caiu e o valor bate, a baixa sai na hora
  e o cliente vê "Pagamento confirmado".
- **Botão "Já paguei" da página:** lê os Pix das últimas 3 h. Se nada casou pelo txid, aceita pelo valor só quando há
  exatamente um Pix solto com o valor da mensalidade. Com dois ou mais, pede o comprovante.

A cobrança da Efí não é usada nesse modo. O Pix recebido pela chave pode ter a tarifa da conta: confira a tabela de
tarifas da Efí.

## Para ficar automático de vez

Se o banco da chave tiver API Pix com webhook (Inter, Sicoob, Itaú e outros), dá para ligar como foi feito com a Efí e
dispensar o extrato. Isso só vale a pena se o banco não cobrar por Pix recebido pela API.

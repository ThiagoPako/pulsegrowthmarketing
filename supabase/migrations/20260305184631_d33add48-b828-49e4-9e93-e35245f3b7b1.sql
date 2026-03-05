ALTER TABLE public.payment_config
  ADD COLUMN IF NOT EXISTS msg_billing_due text NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Passando para lembrar que a mensalidade no valor de {valor} vence no dia {dia_vencimento}.

Se já realizou o pagamento, por favor desconsidere esta mensagem.

{dados_pagamento}

Qualquer dúvida, estamos à disposição!

Equipe Pulse Growth Marketing 🚀',
  ADD COLUMN IF NOT EXISTS msg_billing_overdue text NOT NULL DEFAULT 'Olá, {nome_cliente}! 😊

Esperamos que esteja tudo bem! Passando aqui apenas para lembrar que identificamos uma pendência referente à mensalidade no valor de {valor}.

Se já realizou o pagamento, por favor desconsidere esta mensagem e nos envie o comprovante.

{dados_pagamento}

Qualquer dúvida, estamos à disposição!

Equipe Pulse Growth Marketing 🚀',
  ADD COLUMN IF NOT EXISTS include_delivery_report boolean NOT NULL DEFAULT true;
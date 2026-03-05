ALTER TABLE public.payment_config ADD COLUMN msg_payment_data text NOT NULL DEFAULT '💳 *Dados para pagamento:*
Nome: {nome_recebedor}
Banco: {banco}
Chave PIX: {chave_pix}
CPF/CNPJ: {documento}';
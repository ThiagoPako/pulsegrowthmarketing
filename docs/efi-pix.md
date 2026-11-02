# Efí Bank · Pix das mensalidades

Implementado em `vps-api-server/lib/efi.mjs` e `vps-api-server/efiPixRoutes.mjs`; a tela fica em Financeiro → Pagamentos.
Fonte: a documentação oficial em <https://dev.efipay.com.br/docs/api-pix> (credenciais, cobranças imediatas, webhooks,
gestão de Pix e endpoints exclusivos).

## O que o Thiago cria na conta Efí (uma vez por cidade que tiver conta própria)

1. **Aplicação.** No menu da esquerda, clique em **API** (lá embaixo) e depois em **Criar aplicação**. Ligue a **API Pix**
   e a **API Cobranças** (cartão; marque tudo dela) e marque os escopos da API Pix, em Produção e em Homologação:
   - obrigatórios: `cob.write`, `cob.read`, `pix.read`, `webhook.write`, `webhook.read`, `payloadlocation.read`;
   - opcional: `gn.balance.read`, que mostra o saldo na tela.

   A aplicação gera dois pares de **Client ID / Client Secret**: um de Produção e um de Homologação.
2. **Certificado.** Em **API → Meus Certificados**, escolha o ambiente (Produção ou Homologação), clique em **Novo
   Certificado**, dê um nome e baixe o arquivo `.p12`. A Efí só deixa baixar uma vez, então guarde o arquivo. O
   certificado tem de ser do mesmo ambiente do par Client ID / Client Secret.
3. **Chave Pix.** Use uma chave Pix cadastrada na conta Efí (aleatória, e-mail, CNPJ…).
4. **Na Pulse**, em Financeiro → Pagamentos → a cidade → **Efí Bank · Pix**, faça nesta ordem:
   1. escolha o ambiente e cole o Client ID, o Client Secret e a chave Pix;
   2. envie o `.p12` e clique em **Salvar Efí**;
   3. clique em **Testar conexão**;
   4. ligue **Cobrar com a Efí**.

   Os valores são colados pelo Thiago; ninguém digita as chaves por ele.

Comece em **Homologação**. Nesse ambiente, a Efí só confirma cobranças de R$ 0,01 a R$ 10,00 (as acima disso ficam
ativas e não são confirmadas). Depois troque para Produção, com as credenciais e o certificado de Produção.

## Como funciona

- **Cobrança:** com a Efí ligada, cada mensalidade vira uma cobrança imediata (`PUT /v2/cob/:txid`). O `txid` é
  `pulse` + aaaamm + hash do contrato, mês e valor, e a cobrança vale até o vencimento + 30 dias.
  - O `pixCopiaECola` da Efí vai para a mensagem que leva só o código, para o PDF (QR) e para a página /pagar.
  - Usamos a cobrança imediata e não a com vencimento (`cobv`) porque a `cobv` exige o CPF/CNPJ do devedor, e o sistema
    não guarda o documento dos clientes.
- **Baixa:**
  - o webhook avisa;
  - a varredura de 10 em 10 min lê os Pix recebidos das últimas 48 h (`GET /v2/pix`) e consulta as cobranças abertas;
  - a baixa só sai depois de `GET /v2/cob/:txid` responder `CONCLUIDA`. Ela marca a receita como recebida, faz a entrada
    no caixa e manda o obrigado com recibo.
- **Conciliação:** Pix que chega sem `txid` da Pulse fica como **conferir**. Ele aparece em Financeiro → Pagamentos e no
  resumo do dia da cidade, e é marcado à mão com "Marcar conferido".
- **Cartão:** pelo link de pagamento da Efí (API Cobranças), só no cartão e em até 12x. O valor já leva a taxa do cartão
  repassada (`card_fee_percent`), e a página e o PDF mostram o aviso discreto. A baixa sai pela notificação da Efí
  (`/api/webhooks/efi-cobranca/:city?hmac=…`, sem mTLS) ou pela varredura de 30 em 30 min (status `paid`/`settled`).
  Código em `lib/efiCobrancas.mjs` e `efiCardRoutes.mjs`.
- **Só a Efí (02/11/2026):** a InfiniteTag, o teste e os links da InfinitePay saíram da tela, e nenhuma cobrança nova cria
  link da InfinitePay. A chave Pix é uma só, a da conta Efí. Com "Pix com baixa automática" ligado, o Pix é dinâmico.
  Desligado, o Pix sai pela chave, sem taxa, com o comprovante na página de pagamento (`docs/pix-chave-comprovante.md`).

## Webhook com mTLS (servidor)

A Efí só aceita cadastrar o webhook (`PUT /v2/webhook/:chave`) numa URL HTTPS com **TLS mútuo**. Primeiro ela manda uma
requisição sem certificado, que o servidor tem de recusar, e depois uma com o certificado dela. **Enquanto isso não
estiver no nginx, o botão "Cadastrar webhook" mostra o erro e a varredura de 10 em 10 min continua dando baixa.**

Sugestão: um subdomínio só para o webhook, para o domínio principal não pedir certificado aos navegadores.

```nginx
# /etc/nginx/sites-available/webhook-efi.agenciapulse.tech
server {
    listen 443 ssl;
    server_name webhook-efi.agenciapulse.tech;

    ssl_certificate     /etc/letsencrypt/live/webhook-efi.agenciapulse.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webhook-efi.agenciapulse.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # cadeia pública da Efí (produção; em homologação: certificate-chain-homolog.crt)
    # curl -o /etc/nginx/efi/certificate-chain-prod.crt https://certificados.efipay.com.br/webhooks/certificate-chain-prod.crt
    ssl_client_certificate /etc/nginx/efi/certificate-chain-prod.crt;
    ssl_verify_client on;
    ssl_verify_depth 3;

    location /api/webhooks/efi/ {
        allow 34.193.116.226;   # IP que a Efí usa nos webhooks (doc)
        deny all;
        proxy_pass http://127.0.0.1:3002;   # API_PORT da API Pulse (padrão 3002)
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Depois, no `.env` da API: `EFI_WEBHOOK_BASE_URL=https://webhook-efi.agenciapulse.tech`. Reinicie a API e clique em
**Cadastrar webhook** em cada cidade.

A URL cadastrada leva um `hmac` secreto por cidade e termina em `&ignorar=`, para a Efí não acrescentar `/pix`. A rota
aceita os dois formatos. A notificação sem o `hmac` certo é recusada, e mesmo com ele a baixa só sai depois da consulta
na Efí.

## Ainda não faz

- **Extrato completo da conta** (tarifas, transferências): a API Extratos da Efí entrega arquivos CNAB 240, só em
  Produção. Fica para depois; hoje entram os Pix recebidos e o saldo.
- **Pix Automático** (recorrência): os escopos já podem ser marcados na aplicação, mas a programação ainda não foi feita.

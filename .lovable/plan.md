# Sorteios de Prêmios — Roleta e Raspadinha com QR Code

Módulo completo de gamificação promocional: cupons impressos com QR Code descartável, jogo online (roleta ou raspadinha), voucher com código de resgate e validação no caixa do posto.

Tudo roda na nossa VPS (API própria + banco PostgreSQL), como o resto do sistema. Nenhum serviço externo.

## 1. Banco de dados (VPS)

Como já existe um módulo "Campanhas" no sistema, as tabelas novas usam o prefixo `promo_` para não conflitar:

- `promo_campaigns` — título, slug único, regulamento, exigir cadastro (LGPD), texto LGPD, banner, cor de destaque, ativo.
- `promo_prizes` — vínculo com a campanha, nome, descrição de retirada, foto, quantidade total, quantidade restante, % de chance, ativo.
- `promo_tickets` — vínculo com campanha, token curto único (10 caracteres), status (`available`, `opened`, `revealed`, `redeemed`, `expired`), prêmio sorteado, código de resgate único, nome/telefone/CPF do participante, aceite LGPD, datas de abertura e resgate, operador que entregou.

Índices em token, código de resgate e campanha. Prefixo do código de resgate configurável por campanha (padrão `A3P-`).

## 2. Motor de sorteio (servidor — à prova de F12)

Toda a lógica fica na API; o navegador só recebe o resultado já decidido.

- `POST /api/promo/play` — valida token e status, exige cadastro + LGPD quando a campanha pedir, sorteia por probabilidade ponderada considerando só prêmios ativos com saldo, decrementa o estoque de forma atômica dentro de uma transação com trava de linha, grava participante, gera o código de resgate e devolve o prêmio. Sobra de probabilidade vira "Tente novamente".
- `POST /api/promo/validate` — busca pelo código: inválido, já resgatado (com data/hora e operador) ou liberado; confirmação de entrega grava data e operador.
- `GET /api/promo/public/:slug/:token` — dados públicos da campanha e situação do cupom (sem expor prêmios sorteados de terceiros).
- Endpoints administrativos protegidos: CRUD de campanhas e prêmios, geração de lotes de cupons, métricas e exportação de leads.
- Proteção contra abuso: limite de tentativas por IP/token.

## 3. Aplicação pública (layout independente)

Visual festivo premium: preto, vermelho e dourado, mobile-first, animações leves para 4G.

- `/sorteio/:slug/:token` — jogo do cliente:
  1. Cupom já usado ou inválido → tela informativa convidando a abastecer de novo.
  2. Cadastro + aceite LGPD (só quando a campanha exigir), com o regulamento em modal.
  3. Escolha entre Roleta e Raspadinha.
  4. Roleta em SVG que desacelera exatamente no prêmio devolvido pelo servidor, com som opcional e confete; Raspadinha em canvas que revela o prêmio ao raspar 50% (funciona com dedo e mouse).
  5. Voucher com foto, nome do prêmio, instruções e o código de resgate em destaque, com aviso de que sem o código não há retirada, botão de salvar comprovante em imagem e link para o regulamento.
- `/sorteio/:slug/validar` — área do caixa, protegida por PIN da campanha: campo grande para digitar o código, resultado verde (foto, prêmio, cliente, botão "Confirmar entrega") ou vermelho (já entregue, com data/hora e operador). Leitura por câmera do QR na tela do cliente.

## 4. Painel administrativo

Rota interna `/sorteios-premios`, visível para admin (e liberável por permissão).

- Lista e edição de campanhas: nome, slug, banner, regulamento, exigir cadastro, texto LGPD, cor, PIN do caixa, ativar/desativar.
- Painel de métricas: cupons gerados, escaneados, prêmios sorteados, resgatados e leads capturados; saldo por prêmio em tempo real.
- Cadastro de prêmios com foto (upload na VPS), estoque e % de chance, com aviso quando a soma passa de 100%.
- Gerador de lotes: escolhe a quantidade (50/100/250 ou livre), cria os tokens e abre a folha A4 pronta para imprimir — 24 cupons por página, linhas de corte pontilhadas, logo, título "Sorteios de Prêmios", chamada "Abasteceu, raspou ou girou, ganhou!", QR Code exclusivo e token impresso pequeno para conferência.
- Aba de leads com nome, telefone, prêmio, data e aceite LGPD, com exportação em CSV.

## Detalhes técnicos

- Backend: novos endpoints em `vps-api-server/server.mjs`, migração SQL em `vps-migration/promo_sorteios.sql` (rodar nos bancos de Minaçu e Uruaçu).
- Frontend: páginas em `src/pages/promo/` (jogo, validação, admin), componentes de roleta, raspadinha, voucher e folha A4 em `src/components/promo/`, serviço em `src/services/promoApi.ts`, rotas públicas fora do layout administrativo em `src/App.tsx`.
- QR Code gerado no cliente com a biblioteca `qrcode` (sem chamada externa); confete com `canvas-confetti`.
- Upload de fotos reaproveita o fluxo de uploads já existente na VPS.
- Após aprovar, o deploy é o comando único de sempre na VPS, incluindo a migração.

# Assistente PULSE

O PULSE é o assistente de IA da agência no WhatsApp. Ele roda no Claude e recebe comandos da equipe em texto ou áudio, mas só de números autorizados. Com esses comandos ele consulta e prepara ações no sistema: financeiro, cards, agenda, relatório mensal e mensagens ao cliente. Ele também lê os grupos dos clientes e avisa a equipe quando um cliente pede alguma coisa.

O código fica em `vps-api-server/assistant/`. O `index.mjs` de lá lista os arquivos e as variáveis de ambiente. A tela fica em **Configurações → WhatsApp → Assistente PULSE**, só para admin.

## Como funciona

1. **Número próprio.** A conexão de WhatsApp com a função `assistente` é o número do PULSE. Para conectar, use o botão "Conectar WhatsApp da PULSE" na aba Assistente PULSE: ele cria a conexão "PULSE" e mostra o QR ou o código de pareamento. Se já existir uma conexão sem funções com "pulse" no nome, o cartão oferece "Usar esta conexão para a PULSE". **Não ponha esse número nos grupos dos clientes.**
2. **Números autorizados.** Cada número cadastrado tem:
   - as cidades em que pode agir: Minaçu, Uruaçu ou as duas;
   - as permissões abaixo, conferidas no servidor a cada ferramenta.

   Mensagem de qualquer outro número é ignorada em silêncio e só vai para o log. Se a conexão do PULSE também tiver outra função, a mensagem volta para o fluxo normal (aprovação, confirmação de gravação).

   | permissão | o que libera |
   |---|---|
   | `consultar_financeiro` | resumo do mês: receitas previstas, recebidas, a receber e vencidas; despesas; lucro; saldo |
   | `lancar_financeiro` | lançar despesa e receita avulsa |
   | `inadimplentes` | lista de receitas vencidas: cliente, valor e dias de atraso |
   | `relatorios` | pedir o relatório mensal de um cliente e ver como estão os pedidos |
   | `enviar_cliente` | mandar mensagem ou arquivo ao cliente, inclusive o relatório pronto |
   | `criar_cards` | card de conteúdo/vídeo (Kanban de conteúdo, coluna Ideias) ou de design (Nova tarefa) |
   | `alertas_grupos` | receber os avisos de demanda detectada nos grupos |
   | `consultar_producao` | andamento dos cards de um cliente e agenda de gravações |

3. **Confirmação.** Toda ação que muda algo pede "sim" antes de executar.
   - O PULSE manda um resumo montado pelo servidor, por exemplo: `Despesa R$ 350,00 · Minaçu · Combustível · 26/10/2026 · 'gasolina do carro da gravação'` seguido de `Confirma? (sim/não)`.
   - No "sim", o servidor executa o **payload guardado**. O modelo não roda de novo. Antes de executar, o servidor confere outra vez a permissão e a cidade.
   - "não" cancela.
   - A confirmação vale 30 minutos.
   - Consultas respondem direto, sem confirmação.
4. **Áudio.**
   - O pulse-wa baixa a mensagem de voz para a pasta privada `~/pulse-wa-private/audio`, fora de /uploads.
   - O ffmpeg converte para wav 16 kHz mono e o whisper.cpp transcreve em português.
   - O áudio é apagado depois.
   - Sem Whisper instalado, o PULSE responde "Não consegui ouvir o áudio, manda por escrito".
5. **Limite.** Cada número pode fazer 30 comandos por hora (`ASSISTANT_RATE_LIMIT_HOUR`).
6. **Monitor dos grupos.** Liga e desliga na tela. Funciona assim:
   - Ele espera o grupo ficar 3 minutos sem mensagem nova.
   - Ignora as mensagens da equipe, dos números autorizados e dos números conectados.
   - Pergunta ao Claude, com esforço `low`, saída JSON e sem ferramentas, se o cliente pediu algo: post, arte, vídeo, ajuste, gravação ou uma dúvida que precisa de resposta.
   - O conteúdo do grupo é tratado só como dado: ele vai delimitado na pergunta e o classificador não executa nada.
   - A demanda é gravada sem duplicar.
   - Os números com `alertas_grupos` da cidade do cliente recebem um aviso com a sugestão de card. Quem tem `criar_cards` responde "sim" e o card é criado no Kanban certo.

## Pedidos para os agentes dos PCs (`agent_jobs`)

A autenticação é a mesma das outras rotas de agente: cabeçalho `Authorization: Agent <chave>`. A chave é a de Configurações → Agentes, e qualquer chave ativa serve. A URL base é `https://agenciapulse.tech/api`.

| rota | resposta |
|---|---|
| `GET /api/agent/jobs?status=pendente` (`pendente`, `em_andamento`, `entregue`, `falhou`, `cancelado` ou `todos`) | `{ jobs: [{ id, type, status, client: { id, company_name, city }, params, requested_by_name, created_at, claimed_by_name, claimed_at, delivered_at, files, note, fail_reason }] }` |
| `POST /api/agent/jobs/:id/claim` | `200 { job }`. Responde `409 { error, job }` se outro agente já pegou ou se o pedido não está pendente. |
| `POST /api/agent/jobs/:id/deliver`, em multipart, com um ou mais `files` e `note` opcional | `{ job }` com `status: "entregue"` e `files: [{ url, name, size, mime }]`. Só aceita de quem pegou o pedido; outro agente recebe `409`. Tipos aceitos: pdf, png, jpg, webp, mp4, pptx e zip, até 300 MB cada. |
| `POST /api/agent/jobs/:id/fail`, corpo `{ reason }` | `{ job }` com `status: "falhou"`. Vale para pedido pendente ou para um pedido em andamento que o próprio agente pegou. |
| `GET /api/agent/clients/:id/report-data?month=AAAA-MM` | dados do mês para o relatório (veja abaixo) |

O que acontece com cada pedido:
- `type` hoje é `relatorio_mensal`.
- `client.city` vem como `minacu` ou `uruacu`. Cliente administrativo vem com `null`.
- `params` do relatório: `{ "month": "2026-10", "theme": "novembro-azul-labovitta", "template_path": "clientes/labo-vitta/design/apresentacoes/2026-10-20-novembro-azul" }`. O `template_path` é relativo à pasta `~/Movies/OPEN CUT`.
- Na entrega, os arquivos vão para `/uploads/relatorios/<cliente>/<pedido>/` com nome aleatório. Quem pediu recebe o PDF no WhatsApp do PULSE com a pergunta "Relatório de <cliente> de <mês> pronto. Envio no WhatsApp do cliente? (sim/não)". A pergunta só aparece se o número tiver `enviar_cliente`. No "sim", o PDF entra na fila para o grupo do cliente.
- Na falha, quem pediu recebe o motivo.

### `report-data`

O retorno traz os seguintes blocos. Valores financeiros ficam de fora.

- `client`: nome, cidade, nicho, responsável, logo, plano, linha editorial, @ do Instagram e as metas do plano (reels, criativos e stories por semana, gravações por mês).
- `videos`:
  - `aprovados_pelo_cliente`: `content_tasks.approved_at` no mês;
  - `postados`: `social_media_deliveries` com status postado;
  - `entregas_social_por_tipo`.
- `artes`: `design_tasks` aprovadas pelo cliente no mês, ou em aprovado/postado.
- `gravacoes`:
  - `realizadas`: `recordings` com status `concluida`;
  - `por_status`;
  - `producao_registrada`: soma de `delivery_records`.
- `aprovacoes_portal`: `aprovados` e `ajustes_pedidos`, de `client_portal_contents`.
- `instagram`: as mesmas métricas da tela de métricas (cache de 12 h) ou o último retrato salvo do mês em `social_insights_snapshots`. Vem `null` se o cliente não tiver Instagram ligado.
- `demandas_do_grupo`: o que o cliente pediu nos grupos no mês.
- `pendencias`:
  - `esperando_aprovacao_no_portal`;
  - `conteudo_em_producao`;
  - `design_em_producao`;
  - `proximas_gravacoes`.
- `totais`: os números de capa.

## Comandos que o CLI `pulse` precisa ter

O CLI é `~/Movies/OPEN CUT/ferramentas/sistema/pulse.mjs`, de outro trabalho. Os comandos seguem o padrão `node pulse.mjs --agente <nome> <comando>`, com a chave em `~/.config/pulse/agentes/<agente>.key` ou em `PULSE_AGENT_KEY`.

| comando | rota | o que mostra ou faz |
|---|---|---|
| `pedidos [--status pendente\|em_andamento\|entregue\|falhou\|todos]` | `GET /agent/jobs` | lista: id curto, tipo, cliente (cidade), mês, quem pediu, há quanto tempo |
| `pegar-pedido <id>` | `POST /agent/jobs/:id/claim` | assume o pedido. No 409, diz quem já pegou e sai com erro. Mostra `params` e a pasta do tema: `~/Movies/OPEN CUT/<template_path>` |
| `dados-relatorio <cliente_id> <AAAA-MM> [--saida dados.json]` | `GET /agent/clients/:id/report-data` | grava o JSON do mês (padrão: `clientes/<pasta-do-cliente>/relatorios/<AAAA-MM>/dados.json`) |
| `entregar-pedido <id> <arquivo.pdf> [mais arquivos…] [--notas "texto"]` | `POST /agent/jobs/:id/deliver` (multipart `files` + `note`) | envia e mostra o link de cada arquivo |
| `falhar-pedido <id> "motivo"` | `POST /agent/jobs/:id/fail` `{ reason }` | registra a falha. O PULSE avisa quem pediu |
| `esperar-pedidos [minutos]` (opcional) | `GET /agent/jobs?status=pendente` a cada 1 min | fica rodando até chegar um pedido novo, como o `esperar` dos recados |

## Passo a passo do agente que gera o relatório mensal

1. **Pegar o pedido.**
   - Rode `pulse --agente <nome> pedidos`. Para cada pedido `relatorio_mensal`, rode `pegar-pedido <id>`.
   - Se der 409, outro agente já pegou: siga para o próximo.
2. **Baixar os dados.**
   - Rode `dados-relatorio <client.id> <params.month>`.
   - Tudo no relatório sai deste JSON. Não invente número. Se uma seção vier vazia, o slide diz "sem registro neste mês" ou a seção sai do relatório.
3. **Abrir o tema.** O tema está em `~/Movies/OPEN CUT/<params.template_path>`:
   - `apresentacao.json`: paleta Novembro Azul (`#0B57CF`, `#1677F2`, `#A8D8FF`, `#F4F7FB`) e textos;
   - `_html/01.html … 11.html` e `_html/pdf.html`: layout 16:9, tipografia e componentes.

   A apresentação foi feita com o modelo `modelos/mockup-pulse` (`scripts/gerar.mjs`: HTML/CSS renderizado no Chrome). Use o mesmo caminho: copie o visual e troque o conteúdo pelo do cliente, com o nome e o logo de `client.logo_url` ou da pasta do cliente.
4. **Montar os slides.** Sugestão:
   - capa: cliente, "Relatório de <mês>", logo;
   - resumo: `totais` contra as metas do plano (`client.metas_do_plano`);
   - vídeos aprovados e postados;
   - artes;
   - gravações realizadas;
   - aprovações no portal e ajustes pedidos;
   - Instagram, só se `instagram` existir: alcance, visualizações, seguidores ganhos e melhores posts;
   - pedidos do cliente no grupo;
   - pendências e próximos passos, com as próximas gravações;
   - encerramento.
5. **Gerar o PDF.** Renderize no Chrome headless, 16:9, em `clientes/<pasta-do-cliente>/relatorios/<AAAA-MM>/relatorio-<AAAA-MM>.pdf`.
6. **Conferir.**
   - Os números batem com o `dados.json`.
   - O mês e o nome do cliente estão certos.
   - Nenhum valor em reais aparece.
   - Nenhuma página está em branco.
   - O arquivo tem menos de 30 MB, para o WhatsApp aceitar.
7. **Entregar.** Rode `entregar-pedido <id> relatorio-<AAAA-MM>.pdf --notas "o que vale saber"`. O PULSE manda o PDF para quem pediu e pergunta se envia ao cliente. **O agente nunca envia direto ao cliente.**
8. **Se não der**, por exemplo por falta de dados ou tema ausente, rode `falhar-pedido <id> "motivo claro"`.

## Banco (só aditivo, criado na subida da API)

**`wa_inbound`** ganha estas colunas:
- `route`: `'assistente'` quando a mensagem veio no privado do PULSE;
- `media_type`, `media_path`, `transcript`: áudio;
- `monitored_at`: mensagem já lida pelo monitor dos grupos.

**Tabelas novas:**
- `assistant_settings`
- `assistant_numbers`
- `assistant_conversations`
- `assistant_pending_actions`
- `assistant_log`
- `assistant_demands`
- `agent_jobs`

`WA_PURPOSES` ganha a função `assistente`.

## Variáveis de ambiente

Todas são opcionais.

| variável | padrão |
|---|---|
| `ANTHROPIC_API_KEY` (ou a integração Claude em Integrações → APIs) | — |
| `WHISPER_BIN` | `/opt/whisper.cpp/build/bin/whisper-cli` |
| `WHISPER_MODEL` | `/opt/whisper.cpp/models/ggml-small-q5_1.bin` |
| `WHISPER_THREADS` | núcleos − 1 |
| `FFMPEG_BIN` | `ffmpeg` |
| `WA_PRIVATE_DIR` | `~/pulse-wa-private`, igual para a API e para o pulse-wa |
| `ASSISTANT_RATE_LIMIT_HOUR` | `30` |
| `ASSISTANT_TICK_MS` | `3000` |
| `ASSISTANT_MONITOR_TICK_MS` | `30000` |
| `ASSISTANT_GROUP_DEBOUNCE_S` | `180` |
| `ASSISTANT_DISABLED=1` | desliga os laços (as rotas continuam no ar) |

O Whisper é instalado pelo `update_vps.sh`, que chama `scripts/install-whisper.sh` só quando falta o binário ou o modelo. A instalação usa a tag fixa v1.9.4 com `--depth 1`, compila com cmake e baixa o modelo do HuggingFace conferindo o SHA-256. Se falhar, o deploy segue normalmente.

## Teste

O teste é `vps-api-server/tests/assistente-pulse.e2e.mjs`. Ele usa um Postgres de teste e uma API falsa do Claude. Rode da pasta `vps-api-server`:

```
TEST_DATABASE_URL=postgres://postgres:teste@localhost:55432/pulse_assistente node tests/assistente-pulse.e2e.mjs
```

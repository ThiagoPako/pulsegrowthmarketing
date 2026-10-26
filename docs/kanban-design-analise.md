# Kanban de Design — análise e mudanças (26/10/2026)

Telas analisadas: `src/pages/DesignerKanban.tsx`, `src/components/designer/*` (criação, detalhe, card do painel,
tutorial), `src/hooks/useDesignTasks.tsx` e as rotas do servidor que alimentam o Kanban (`/api/design-tasks/fast`,
`/api/db/query`, portal). Objetivo: deixar o Kanban claro para a equipe e pronto para **2 designers-agentes e 1 revisor
de artes** (Claude Code nos computadores da equipe, CLI `pulse.mjs`), com a Marcely como chefe.

## 1. Colunas — o que cada uma faz

| Coluna | Para que serve | Quem move | Efeitos ao entrar |
|---|---|---|---|
| Nova Tarefa | Fila. Agentes de IA pegam daqui (`pulse arte pegar`). | criação, "Voltar para Nova Tarefa", chefe | — |
| Executando | Arte em produção | "Iniciar"/arrastar; `pegar` do agente | começa o cronômetro; pausa a outra tarefa ativa da mesma pessoa (pede motivo) |
| Fila Baixa Prioridade | Pausadas para priorizar outra | automático ao iniciar outra; arrastar | cronômetro para |
| Ajustes Solicitados | Correção pedida (equipe, cliente no portal ou revisor de artes) | detalhe ("Pedir ajustes"), portal, parecer da IA | volta para **quem fez a arte** |
| **Análise IA** (nova) | Entrega de agente esperando o revisor de artes | `pulse arte entregar` | cronômetro para; nada vai para o cliente |
| Em Análise (equipe) | Revisão humana | "Enviar p/ análise", parecer ✅ da IA, "Liberar p/ revisão" | prazo é limpo (não fica "atrasada") |
| Enviar para Cliente | Aprovada pela equipe | "Aprovar arte" | — |
| Aprovadas — para agendar | Aprovada pelo cliente | "Marcar aprovado", portal | `completed_at`; logomarca grava o Drive de identidade do cliente |
| Artes Postadas | Publicadas (21 dias) | menu da coluna Aprovadas, arrastar | — |

## 2. Botões e funções (como estavam)

**Cabeçalho:** filtro de cliente; "Ver Playbook" (com cliente escolhido); abas Kanban / Agendamentos / Lista;
"Nova Tarefa" (admin, social media, designer).

**Barra de filtros:** criação de/até, prazo de/até, "Aparecem primeiro" (ordem manual, atrasados, criação, prazo),
"Atrasados", "Limpar filtros".

**Coluna:** contador; em Aprovadas, menu "Baixar todas", "Agrupar em PDF", "Enviar todas para Postadas";
"Carregar mais 10" (paginação por coluna).

**Card:** clique abre a **prévia da copy**; lápis abre o detalhe; lixeira (admin); "Iniciar Tarefa"/"Retomar Tarefa"
(Nova e Fila baixa); "Pausar"/"Retomar" cronômetro e "Voltar para Nova Tarefa" (Executando); arrastar entre colunas e
para reordenar (só na ordem manual). Selos: formato, prioridade, prazo, cronômetro, "Pausada", SLA de 72 h, "Parada há",
"Arte ✓"; posição na fila (#1 com chama).

**Prévia:** copy, descrição, referências (imagens e links), "Ver detalhes completos".

**Detalhe (Sheet):** cabeçalho com responsável, tempo, coluna, prazo editável, baixar arte(s)/PDF, excluir.
Aba Briefing (cliente, histórico de ajustes, título, copy editável pela social media, descrição, editorial do cliente,
referências e editor de referências, colaborador aniversariante, ajustes pedidos), aba Checklist (identidade visual e
reformulação), aba Histórico (linha do tempo). Centro: etapa atual, "Iniciar execução", envio da arte (link ou upload
múltiplo, substituir uma arte do carrossel), arquivo editável, observações, mockup em PDF (identidade/reformulação),
formulário de ajustes. Direita: "Mover para" por coluna — Iniciar; Enviar p/ análise; Aprovar arte / "Enviar para
revisão"; Enviar via WhatsApp (Portal + WhatsApp, sem duplicar) / Marcar aprovado.

**Criação:** cliente (ou não cadastrado), título obrigatório, formatos em múltipla escolha (um card só, os formatos iam
como texto na descrição), prioridade, vencimento, copy livre, referências (link ou imagem), referências em texto, descrição.

## 3. Problemas encontrados

1. **Feed rápido quebrado:** `/api/design-tasks/fast` fazia `COALESCE(attachment_urls, ARRAY[]::text[])`, mas a coluna
   é JSONB no banco de produção (o de teste é cópia do esquema). A rota respondia 500 e o Kanban caía na cascata lenta do
   `/api/db/query` a cada carga.
2. **Brief pobre para quem cria:** sem medida (feed/story sem pixels, "Mídia física" sem tamanho, nada de impressão),
   copy num texto livre sem separar título/CTA/informações obrigatórias, sem pasta de materiais, e a pasta do Drive do
   cliente não aparecia no card. Nada impedia criar arte sem copy nem descrição; só o título era obrigatório.
3. **Múltiplos formatos num card só** (lista na descrição): impossível conferir a entrega de cada formato.
4. **Nome de botão enganoso:** em Em Análise, "ENVIAR PARA REVISÃO" na verdade **pedia ajustes** ao designer.
5. **Celular:** ações do card só apareciam com o mouse em cima; arrastar não funciona no toque; colunas de 270 px sem
   encaixe; a barra de filtros ocupava a tela.
6. **Coluna sem explicação:** só o nome; quem chega não sabe o que fazer em cada uma.
7. **Dois cliques para o essencial:** o clique no card abre a prévia, que não mostrava formato, Drive nem o que faltava.
8. **Nada preparado para agentes:** sem selo de quem está trabalhando, sem etapa para revisão de IA, sem filtro, sem
   API — e um "Iniciar" humano num card reservado a um agente tiraria a arte dele.
9. Pastas do Drive dos clientes faltando em vários cadastros (a IA não acha identidade, logos e fotos).

## 4. O que mudou

### Para a equipe
- **Formulário novo** (`DesignTaskCreateDialog`): cliente com aviso de pasta do Drive; **formato e dimensão** com presets
  (Feed 1080×1350, Quadrado, Story 1080×1920, Carrossel com n slides, Capa, Thumbnail, **Panfleto A5/A4**, **Banner** com
  tamanhos em cm, **Outdoor 9×3 m**, Cartão de visita, Logomarca e **Personalizado** em px/cm/mm com DPI e sangria);
  "criar também em outros formatos" (um card por formato); **copy em campos** (título, texto de apoio, CTA, informações
  obrigatórias: telefone, endereço, preço, data, @, outras — `copy_text` continua com o texto montado); descrição;
  **link do Drive dos materiais**; **referências por arquivo** (PNG/JPG/WebP/HEIC, PDF, vídeo curto; vários, com prévia e
  remover; pasta `design-refs/<cliente>/<tarefa>`) e por link; prazo, prioridade e título (opcional: usa o da copy).
  **Validação do mínimo** (cliente, formato/dimensão e copy ou descrição) com a explicação do que falta.
- **Detalhe**: bloco "Brief da arte" (formato com pixels/sangria, copy em campos, materiais, o que falta) com "Editar";
  links da **pasta do Drive do cliente** (geral, identidade, fotos) ou aviso; **pareceres da Análise IA** com os erros por
  categoria; referências com envio de arquivos e "Referências guardadas no Drive" (link e data); aviso quando um agente
  está com a arte; responsável mostra "IA" e quem fez a arte. Ações: em **Análise IA**, "Liberar p/ revisão" e "Pedir
  ajustes"; em Em Análise o botão passou a se chamar **"PEDIR AJUSTES"**.
- **Card**: formato curto ("Feed 1080×1350", "Panfleto A5 · impressão"), **Brief incompleto**, **Sem Drive**, **IA**,
  título da copy no resumo; menu **"Mover para…"** (mesmas regras do arrastar: cronômetro, anexo obrigatório para
  análise, aprovação; confirma antes de tirar a arte de um agente ativo); "Reservada para <agente> (IA)" no lugar do
  "Iniciar" quando a chefe atribuiu a um agente.
- **Coluna**: frase do que fazer nela. **Filtros**: **IA** e **Brief incompleto**. **Celular**: colunas com encaixe
  (85% da tela), atalho "Ir para a coluna…", ações do card sempre visíveis, filtros recolhidos.
- **Prévia** mostra formato, pixels de impressão, materiais, pasta do cliente e o que falta.
- **Clientes**: pasta do Drive **obrigatória** ao cadastrar e ao editar quem ainda não tem, com texto explicando que a IA
  busca ali identidade, logos e fotos; selo "Sem pasta do Drive" no card e aviso com filtro "Mostrar só esses".
- **Portal**: arte em Análise IA (ou com ajuste pedido pela IA) aparece ao cliente como "Em Produção", sem arquivo e sem
  as notas internas.
- **Feed rápido** corrigido (`to_jsonb(attachment_urls)`) e com os campos novos.

### Para os agentes
- Coluna **Análise IA** (`analise_ia`) entre Ajustes e Em Análise; selo **"🎨 Criando · <agente>"**, **"🔧 Em correção"**,
  **"⏸ Parada"** (sem sinal há 30 min) e **"Análise IA · feita por <agente>"** (`DesignAgentBadge`).
- API `vps-api-server/agentDesignRoutes.mjs` (mesma chave `Agent`, pausa e escritório): fila por cidade com prioridade e
  prazo, pegar atômico (uma arte por vez), etapa, detalhe completo, entrega de PNG/JPG/PDF + editável (confere o conteúdo
  e a **medida**; digital fora da medida é recusada), liberar com motivo, parecer com erros por categoria, aprendizado,
  paradas, atribuir e mover (chefe), referências arquivadas.
- Painel **Agentes IA**: artes esperando, na Análise IA e em ajustes; por designer, entregas e pareceres aprovados/com
  ajustes; **aprendizado** por categoria, por designer e os erros recentes.
- Escritório Virtual: designer-agente aparece "🎨 Criando arte" no Ateliê.

## 5. Pendências e sugestões
- O clique no card continua abrindo a prévia (hábito da equipe); se a equipe preferir, trocar para abrir o detalhe direto.
- `VirtualOffice` consulta `design_tasks` com colunas `em_andamento`/`revisao`, que o Kanban não usa: a atividade de
  design das pessoas não aparece por ali (fora do escopo; vale corrigir para `executando`).
- Corrida rara: se uma pessoa clicar "Iniciar" no mesmo segundo em que um agente pega a mesma arte, a gravação da pessoa
  (pelo `/api/db/query`, sem condição) passa por cima. O selo e o menu reduzem o risco; a correção completa seria uma rota
  de "iniciar" atômica também para a equipe.
- Artes antigas sem `dimensions` usam o `format_type` (Feed/Story/Carrossel…); "Mídia física" antiga aparece como
  "Brief incompleto" até alguém escolher a medida.
- Arquivos de referência na VPS: depois de arquivados no Drive do cliente há mais de 30 dias poderiam ser apagados para
  poupar disco (`references_archived_at` já guarda a data). Não foi feito agora.

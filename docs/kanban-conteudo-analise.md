# Kanban de Conteúdo (vídeo): análise e melhorias

Análise feita em 25/10/2026 a partir do código do ramo `main` (bc184265). Cobre o fluxo de vídeo: o Kanban de
Conteúdo, o Kanban de Edição, a Bancada do editor, o Controle de Edição, os detalhes do card e as rotas dos agentes
de IA (Beatriz, Davi, Uriel, Marcely).

## 1. Telas e quem usa

| Tela | Rota | Arquivo | Quem vê (menu) |
|---|---|---|---|
| Kanban de Conteúdo ("Criação de Conteúdo") | `/conteudo` | `src/pages/ContentKanban.tsx` | admin, social_media, videomaker, editor, gestor_projetos |
| Detalhe do card (gaveta lateral) | abre no clique do card em `/conteudo` | `src/components/content/ContentTaskDetailSheet.tsx` | idem |
| Bancada de Edição | `/edicao` | `src/pages/EditorDashboard.tsx` | admin, editor, social_media, videomaker, gestor_projetos |
| Kanban de Edição | `/edicao/kanban` | `src/pages/EditorKanban.tsx` | idem |
| Detalhe do editor (diálogo) | abre só em card de **Otimização** do Kanban de Edição | `src/components/editor/EditorTaskDetail.tsx` | idem |
| Controle de Edição | `/controle-edicao` | `src/pages/EditingControl.tsx` | admin, gestor_projetos, **editor, videomaker** |
| Agentes de IA | `/agentes` | `src/pages/AgentsPanel.tsx` | admin |
| API dos agentes | `/api/agent/*` | `vps-api-server/agentRoutes.mjs` | chave de agente |

Colunas do fluxo (`content_tasks.kanban_column`): `ideias` → `captacao` → `edicao` → `pre_revisao` (Análise, só
entregas de agente) → `revisao` → `alteracao` → `envio` → `agendamentos` → `acompanhamento` → `arquivado`. O tipo
`otimizacao` é um card de Edição que vira vários cards em Revisão; o pacote de stories vira um card por story.

## 2. Inventário de ações

### 2.1 O que cada mudança de coluna grava (`src/lib/contentTaskSync.ts`)

Toda tela chama `syncContentTaskColumnChange(coluna, ctx)` depois de gravar a coluna nova. O sync:

| Coluna nova | Prazos e campos | Social Media (`social_media_deliveries`) | Portal do cliente | WhatsApp | Avisos internos | Histórico |
|---|---|---|---|---|---|---|
| todas (exceto acompanhamento) | zera presença de revisão e todos os prazos; **cancela a postagem automática** ligada ao card | — | — | — | — | — |
| `edicao` | `editing_deadline` (dias úteis); timer só se quem move pegou o card; roteiro marcado como gravado | apaga a entrega | "✂️ Vídeo em edição" (só na 1ª entrada) | "vídeo em edição" ao cliente (só na 1ª entrada, se ligado em Configurações) | — | "Movido para Edição" |
| `pre_revisao` | — | apaga a entrega | — | — | — | "Movido para pre_revisao" (nome cru, ver P15) |
| `revisao` | `review_deadline`, `approval_sent_at`, tira o responsável | status `revisao` | conteúdo em `revisao_interna` (cria ou atualiza pelo vínculo) + "👁 Revisão interna" | — | papel social_media: "Vídeo para Revisão" | "Enviado para Revisão" |
| `alteracao` | `alteration_deadline` (exceto imediata), zera timer e responsável | status `ajuste` | "🔧 Ajuste em andamento" | — | editor do vídeo (`edited_by`): "Ajuste solicitado" | "Solicitado Alteração" (sem o texto do ajuste, ver P11) |
| `envio` | `approval_deadline`, tira o responsável | status `aprovacao_cliente` | conteúdo `revisao_interna` → `pendente` (o cliente passa a ver) + "🎬 Novo vídeo para aprovação" | **o servidor avisa o cliente** quando o conteúdo fica `pendente` | — | "Enviado para Cliente" |
| `agendamentos` | `approved_at`; avulso vai direto para `arquivado` | status `entregue` | "✅ Vídeo aprovado" | — | — | "Movido para Agendamentos" |
| `acompanhamento` | — | status `agendado` | "📅 Vídeo agendado" | — | — | "Agendado para Postagem" |
| `arquivado` | — | status `postado` | "📦 Conteúdo concluído" | — | — | "Arquivado" |

### 2.2 Kanban de Conteúdo (`/conteudo`)

Cabeçalho

| Ação | Quem | O que faz / grava |
|---|---|---|
| Seletor de praça (Todas, Minaçu, Uruaçu) | quem tem mais de uma praça | só leitura das outras praças (cards com "somente leitura", sem ações) |
| Pesquisar, filtro Cliente, filtro Tipo | todos | só tela |
| **Organizar** | todos | reordena por última movimentação — as colunas **já** são ordenadas assim: o botão não faz nada (P1) |
| Novo Conteúdo / "+ Adicionar" no pé da coluna | quem pode agir na coluna | diálogo: cliente (ou "não cadastrado"), tipo, título, descrição, coluna, responsável, gravação, roteiro, data/hora de gravação, link do Drive, link do vídeo. Cria o card e roda o sync da coluna inicial (exceto Ideias) |

Quadro e card

| Ação | Coluna | Quem | O que grava |
|---|---|---|---|
| Arrastar o card para outra coluna | qualquer | editor (Edição/Alteração → Revisão), videomaker (Ideias/Captação e alteração de story), **todos os outros papéis para qualquer coluna** | `kanban_column` + sync. Regras: Edição exige responsável; Captação→Edição exige Drive; Revisão exige vídeo. **Não pede o texto do ajuste ao ir para Alteração e não confirma a ida para "Enviado p/ Cliente"** (P2, P3) |
| Setas ◀ ▶ do card | qualquer | admin e demais papéis não restritos | move para a coluna **vizinha na tela** (P4): Edição ▶ Análise; Revisão ▶ **Alteração sem ajuste**; Alteração ▶ **Enviado p/ Cliente, pulando a revisão e avisando o cliente** |
| Clique no card | — | todos | abre o detalhe (2.3) |
| ✏ Editar (só no hover) | qualquer | quem pode agir | mesmo diálogo do "Novo"; trocar a coluna por aqui roda o sync. **Invisível no celular** (P6) |
| 🗑 Excluir (só no hover) | qualquer | admin, social_media | confirmação + `deleteContentTask` (portal, Social Media, postagem automática, histórico) |
| Roteiro: <título> | qualquer | todos | abre o texto do roteiro |
| Link Drive / Materiais (Drive) | Captação, Edição | não editor (videomaker só em Captação) | grava `drive_link` (sem conferir o formato) |
| Link Vídeo | Edição, Alteração | não videomaker | grava `edited_video_link` |
| → Edição | Captação com Drive | não editor | move para Edição — **barrado pela regra "precisa de responsável"** (P5) |
| Aprovar | Revisão | admin, social_media | `envio` + `approved_at` + sync (o cliente vê no portal e recebe WhatsApp). Um clique, sem confirmação |
| Ajustes | Revisão | admin, social_media | diálogo (texto obrigatório + "Imediata") → `alteracao` + sync |
| Portal / Baixar | Revisão, Alteração | todos | abre o **portal inteiro** do cliente (não o vídeo) / baixa o arquivo |
| Reenviar Revisão | Alteração | editor, admin, videomaker (story) | `revisao` + sync (exige vídeo) |
| → Agendamentos | Enviado p/ Cliente | admin, social_media | `agendamentos` + sync (aprovação manual em nome do cliente) |
| Agendar | Agendamentos | admin, social_media | diálogo data/hora → `acompanhamento` + sync |
| Confirmar Postagem | Acompanhamento | não editor/videomaker | `arquivado` + Social Media `postado`. **Não roda o sync**: não cancela a postagem automática pendente (risco de postar duas vezes) e não registra histórico (P7) |

Selos do card: praça, Gravando, Aguardando Material, Vence Hoje, "<nome> revisando", enviado/aguarda, Agendar,
Para Postar, ⚡ Prioridade, 🚨 Imediato, "Em correção · agente" (`AgentFixBadge`, só Alteração), Otimizar, tipo,
🔄 Alterado, prazo da coluna.

### 2.3 Detalhe do card (`ContentTaskDetailSheet`)

| Ação | Coluna | Quem | O que grava |
|---|---|---|---|
| Jornada do conteúdo + histórico (20 últimos) | — | todos | só leitura. **O histórico mostra a ação, mas não o detalhe** (texto do ajuste, motivo do agente) (P11). Card em Análise aparece como "Criado" na jornada e sem nome de coluna (P12) |
| Trocar/atribuir responsável | todas menos Revisão | admin, social_media | `assigned_to` + `created_by` da entrega do Social Media + histórico |
| Mencionar colaborador | — | todos | notificação + histórico |
| Adicionar Link Drive | Captação, Edição (não editor); alteração de story (videomaker) | | `drive_link` |
| Enviar arquivo de vídeo / Colar link | Edição, Alteração sem vídeo | editor, videomaker | upload até 2 GB → `edited_video_link` |
| Finalizar Etapa → Captação / Edição / Revisão | Ideias, Captação, Edição | conforme papel | move + sync |
| Marcar Prioridade | Edição | admin, social_media | `editing_priority` + aviso a todos os editores |
| Aprovar e Enviar ao Portal / Solicitar Ajustes | Revisão | admin, social_media | como no card; o aprovar também grava o conteúdo do portal como `pendente` |
| Otimizar Conteúdo | reels de Revisão em diante | admin, social_media | cria card `otimizacao` em Edição |
| Slots de otimização | card de Otimização | todos | grava os links no `description`; "Revisão" divide em cards |
| Reenviar para Revisão | Alteração | editor, videomaker, admin, social_media | `revisao` + sync |
| Cliente Aprovou / Convidar via WhatsApp / Solicitar Alteração | Enviado p/ Cliente | admin, social_media | `agendamentos` + portal `aprovado` / WhatsApp manual / `alteracao` |
| Agendar Postagem | Agendamentos | admin, social_media | `acompanhamento` + Social Media `agendado` |
| Confirmar Postagem | Acompanhamento | admin, social_media | igual ao card (sem sync, P7) |
| — | **Análise** | — | **nenhuma ação** (P13) |

Quase nenhum handler da gaveta confere o erro do `update`: se o servidor recusa, a tela mostra sucesso e roda o sync
mesmo assim (P10).

### 2.4 Kanban de Edição (`/edicao/kanban`)

Colunas: Para Editar (`edicao`), Análise (`pre_revisao`), Em Revisão, Alteração, **Concluído** (`envio`, que no
Kanban de Conteúdo se chama "Enviado p/ Cliente", P8). Editor/videomaker sem acesso total só vê a fila livre e os
próprios cards.

| Ação | Coluna | Quem | O que grava |
|---|---|---|---|
| 🚩 Marcar como Meu | Para Editar livre | todos | `assigned_to`/`edited_by` (atômico: só se ainda livre) |
| Clique na bandeira "Marcado por" (só hover diz "Clique para liberar") | Para Editar/Alteração, card meu | dono | libera o card (`assigned_to` nulo; em edição também `edited_by`). **Sem confirmação; no celular não há aviso** (P6) |
| Adicionar/Atualizar link do vídeo editado | Para Editar (meu), Alteração | | `edited_video_link` (e assume o card se livre) |
| Enviar para Aprovação | Alteração com vídeo | | `revisao` + sync |
| Ops! Volta aqui | Em Revisão, editado por mim | editor | volta para Edição com timer, apaga a entrega do Social Media, histórico. Sem confirmação e sem sync (o conteúdo do portal fica em `revisao_interna`) |
| Ver roteiro gravado / Abrir materiais no Drive / Assistir no Portal | | todos | só leitura |
| Abrir & anexar vídeos | card de Otimização | todos | abre o `EditorTaskDetail` |
| Arrastar entre colunas | todas | editor: Edição/Alteração → Revisão; **admin e demais: qualquer coluna, inclusive "Concluído" (= enviar ao cliente) e para fora da Análise, sem confirmação e sem pedir ajuste** (P2, P3) | `kanban_column` + sync |

Os cards **não abrem detalhe** (só o de Otimização): o editor não vê histórico, comentários nem o pacote de stories
que o `EditorTaskDetail` já sabe montar (P9). Card em Análise/Revisão não mostra quem editou (a tela mostra
`assigned_to`, que o sync zera na revisão) (P14).

### 2.5 Bancada (`/edicao`)

| Ação | Quem | O que grava |
|---|---|---|
| Fila de Edição (edição livre + alterações): Marcar como Meu / Iniciar Edição / Iniciar Alteração | editores (admin vê todos) | atômico; `editing_started_at`; histórico |
| Card em edição (hero): Pausar/Retomar, Materiais, Roteiro, Trocar vídeo, Devolver à Fila (com confirmação), Finalizar/Enviar para Revisão | dono | timer, upload até 500 MB (apaga o vídeo anterior se não estiver no portal), `revisao` + sync |
| Também em edição | — | lista os cards com timer — **inclui os cards que um agente pegou**, sem dizer que é agente; o admin pode abrir o hero e "Finalizar" ou "Devolver" um card que o agente está renderizando (P16) |
| Em Revisão → Ops! Volta aqui | editor do vídeo | igual ao Kanban de Edição |
| Enviar Story Editado | todos | cria card em Agendamentos já aprovado + Social Media + portal `pendente` + avisos |

Alteração na fila: a ordenação e o prazo usam `editing_deadline`, que a alteração não tem — **alterações aparecem sem
prazo e no fim da fila**, a não ser as imediatas (P17). A fila dos agentes põe toda alteração primeiro.

### 2.6 Detalhe do editor (`EditorTaskDetail`)

Iniciar Edição (atômico), upload com progresso/cancelar (até 2 GB), colar link, slots de otimização, pacote de
stories (vira um card por story), comentários, histórico, Pausar/Retomar, "Finalizar e Enviar" (`revisao` + sync) e
**"Marcar como Finalizado" em Revisão, sem checar papel nem confirmar** — leva o card para `envio` (o cliente é
avisado). Hoje só é alcançável por card de Otimização, mas é um botão arriscado (P9).

### 2.7 Controle de Edição (`/controle-edicao`)

Arrastar card da fila para um editor, de um editor para outro ou de volta para a fila: grava `assigned_to`,
`edited_by`, timer, histórico e avisa o editor anterior. **Editores e videomakers também acessam e podem tirar card de
colega**; não há checagem de agente com sinal de vida (a rota `/api/agent/tasks/:id/assign` checa) (P18).

### 2.8 API dos agentes (`agentRoutes.mjs`)

| Rota | Quem | O que faz |
|---|---|---|
| `GET /api/agent/queue` | todos | Para Editar livre ou do agente + Alteração de vídeo que o próprio agente editou; sem Otimização; alteração primeiro, depois imediata, prioridade, prazo. Traz roteiro, Drive do card e do cliente (`client_drive_link`), identidade visual, ajustes, `last_version` |
| `POST …/claim` | editor | assume (atômico), `agent_step = 'iniciado'`, timer, histórico. Recusa com pausa |
| `POST …/heartbeat` | dono | `agent_step` + `agent_heartbeat_at` |
| `POST …/release` | dono ou chefe | devolve para a fila, histórico com motivo |
| `POST …/deliver` / `deliver-stories` | dono | vídeo + plano → `edit_versions`, card em **Análise** (`pre_revisao`), sem prazo, Social Media ou portal |
| `GET /api/agent/tasks?search=` | chefe, revisor | busca no fluxo de edição |
| `POST …/move` | chefe | Edição/Revisão/Alteração com o mesmo efeito do sync (alteração exige `adjustment_notes`) |
| `POST …/type`, `…/assign`, `GET /api/agent/stale` | chefe | tipo, passar card (só se o dono não estiver ativo), travados |

O CLI (`pulse pegar`) ainda recusa card sem `drive_link` ou com cliente fora do `mapa.json`.

## 3. Problemas encontrados

Gravidade: 🔴 arriscado/quebrado · 🟠 confuso/escondido · 🟡 detalhe.

| # | Onde | Problema | Gravidade |
|---|---|---|---|
| P1 | Kanban de Conteúdo | "Organizar" não faz nada (a coluna já é ordenada por movimentação) | 🟡 duplicado |
| P2 | Kanbans (arrastar, setas) | Ir para Alteração por arrastar/seta não pede o ajuste: o editor (humano ou agente) recebe a alteração sem saber o que mudar. A API exige o texto | 🔴 |
| P3 | Kanbans (arrastar, setas) | Ir para "Enviado p/ Cliente"/"Concluído" por arrastar/seta não confirma — libera o vídeo no portal e o cliente recebe WhatsApp | 🔴 |
| P4 | Kanban de Conteúdo | As setas seguem a ordem visual das colunas, não o fluxo: Alteração ▶ manda ao cliente pulando a revisão; Revisão ▶ vai para Alteração sem ajuste; Edição ▶ cai na Análise | 🔴 |
| P5 | Kanban de Conteúdo | Para entrar em Edição pelo quadro o card precisa de responsável: quem move vira dono e o card **some da fila dos agentes e dos editores**. O fluxo da gravação (servidor) põe o card em Edição sem dono | 🟠 regra do dono |
| P6 | Kanbans | Editar/Excluir só aparecem no hover; liberar card é um clique na bandeira sem confirmação; arrastar não funciona no toque — no celular faltam ações | 🟠 |
| P7 | Kanban e detalhe | "Confirmar Postagem" arquiva sem o sync: não cancela a postagem automática pendente (o robô pode postar de novo) nem registra histórico. No Social Media o mesmo gesto roda o sync | 🔴 |
| P8 | Kanban de Edição | Coluna "Concluído" = "Enviado p/ Cliente" no outro quadro; "Finalizado" no detalhe do editor | 🟠 |
| P9 | Kanban de Edição | Card não abre detalhe (só Otimização): pacote de stories, comentários e histórico ficam escondidos. No detalhe, "Marcar como Finalizado" não checa papel | 🟠 / 🔴 |
| P10 | Detalhe do card | Handlers não conferem o erro do servidor: mostram sucesso e rodam o sync mesmo quando nada foi gravado. Mensagens genéricas ("Erro ao mover cartão") escondem o motivo | 🟠 |
| P11 | Sync/histórico | O texto do ajuste pedido pela equipe não vai para o histórico (só o `adjustment_notes`, sobrescrito a cada alteração): perde-se o histórico de ajustes, que o agente precisa | 🟠 |
| P12 | Detalhe do card | Card em Análise: sem nome de coluna e jornada em "Criado" | 🟡 |
| P13 | Detalhe do card / Kanban | Análise sem ação nenhuma e sem mostrar o parecer do revisor; ninguém vê se o Uriel já olhou | 🟠 |
| P14 | Kanban de Edição | Card em Análise/Revisão/Enviado não mostra quem editou | 🟡 |
| P15 | Sync | Histórico "Movido para pre_revisao" (nome interno) | 🟡 |
| P16 | Bancada | Card pego por agente aparece em "Também em edição" sem dizer que é agente; dá para finalizar/devolver enquanto ele renderiza | 🟠 |
| P17 | Bancada | Alteração sem prazo na fila e ordenada no fim (usa o prazo de edição) | 🟠 |
| P18 | Controle de Edição | Editores/videomakers podem tirar card de colega; nenhum aviso quando o card está com agente ativo | 🟠 regra do dono |
| P19 | Cards | Avatar do responsável sempre com "bolinha verde pulsando", como se estivesse online; "Cliente" e "Tipo" aparecem duas vezes no card do Kanban de Conteúdo | 🟡 |
| P20 | Agentes | Selo de agente só existe na Alteração; edição feita por agente não aparece nos quadros; card parado (sem sinal) só aparece no painel `/agentes` | 🟠 |
| P21 | Agentes | Não há como ver se o card está pronto para um agente pegar (brutos, roteiro, tipo, prazo): o agente descobre no `pegar` | 🟠 |
| P22 | Agentes / API | O parecer do Uriel só existe como recado para a Marcely; não fica no card. Histórico de ajustes e versões não saem na API | 🟠 |
| P23 | Permissões | No Kanban de Conteúdo, qualquer papel que não seja editor/videomaker (copywriter, designer, gestor…) arrasta qualquer card para qualquer coluna, inclusive enviar ao cliente | 🟠 regra do dono |
| P24 | Kanban de Conteúdo | Botão "Portal" abre o portal inteiro do cliente, não o vídeo do card; o detalhe já tem player | 🟡 |

## 4. O que mudou (ramo `feat/kanban-conteudo`)

Nenhuma regra de negócio mudou: o sync de coluna, os prazos, o portal, o WhatsApp, o Social Media e a aprovação
continuam iguais. O que mudou é o caminho até eles (menos atalho perigoso, mais confirmação) e o que a tela mostra.

### 4.1 Para a equipe (humanos)

| Onde | Mudança | Resolve |
|---|---|---|
| Kanban de Conteúdo | Setas seguem o fluxo (`FLOW_ARROWS`): Ideias ▶ Captação; Captação ◀ Ideias; Edição ◀ Captação / ▶ Revisão; Alteração ▶ Revisão (só para quem não tem "Reenviar Revisão"); Enviado ◀ Pedir ajuste; Agendamentos ◀ Enviado; Acompanhamento ◀ Agendamentos. Onde a coluna tem botão próprio, a seta não repete. Card com agente trabalhando não tem seta | P4 |
| Kanbans (seta, arrastar, diálogo Editar) | Toda ida para **Alteração** abre o pedido de ajuste (texto obrigatório; no "Devolver" da Análise já vem o parecer do revisor IA). Ida para **Enviado p/ Cliente** pede confirmação ("o cliente recebe o aviso pelo WhatsApp"). Arrastar para **Acompanhamento** abre o agendamento (data e hora) | P2, P3 |
| Kanban de Conteúdo | Coluna Análise com aviso do que acontece nela; card com parecer do revisor IA e, para o admin, **Liberar p/ Revisão** e **Devolver** | P13 |
| Kanban de Conteúdo | Card: cliente uma vez (e o nome do não cadastrado), tipo só no selo, rótulo do avatar ("Editado por", "Quem corrige", "Responsável", "· 🤖 IA"), sem a bolinha "online" falsa, link dos brutos também na Análise e na Alteração, "Aprovar e enviar" (deixa claro que vai ao cliente) | P19 |
| Kanban de Conteúdo | "Organizar" (não fazia nada) virou **Ordem: recentes / prazo** (imediatas e prioridades no topo, depois o prazo da etapa) | P1 |
| Kanbans e detalhes | Erros com o motivo do servidor ("Não foi possível mover o cartão: …"); o detalhe confere a resposta antes de mostrar sucesso e rodar o sync; link precisa começar com https:// | P10 |
| Kanban de Conteúdo e detalhe | **Confirmar Postagem** roda o sync, como o "Postado" do Social Media: cancela a postagem automática pendente e registra o histórico | P7 |
| Celular (Kanban de Conteúdo e de Edição) | Faixa de atalho para cada coluna (com contagem); colunas com 85% da tela; Editar/Excluir sempre visíveis; filtros ocupam a largura | P6 |
| Kanban de Edição | Clique no card abre o detalhe (histórico, comentários, upload, pacote de stories); coluna "Concluído" agora é **Enviado p/ Cliente**; card mostra quem editou na Análise/Revisão/Enviado; "Reenviar para Revisão" com o mesmo nome do outro quadro | P8, P9, P14 |
| Kanban de Edição | Liberar card (clique na bandeira) e "Ops! Volta aqui" pedem confirmação; arrastar para Alteração pede o ajuste; para Enviado, confirmação | P2, P3, P6 |
| Detalhe do editor | "Marcar como Finalizado" (mandava ao cliente) virou **Aprovar e enviar ao cliente**, só para admin/social media e com confirmação; status "Análise" e "Enviado ao cliente" | P9 |
| Detalhe do card | Análise com nome e etapa certa na jornada; histórico mostra o detalhe (texto do ajuste, motivo) e guarda 50 itens; "Editado por" quando não há responsável | P11, P12, P14 |
| Sync | O texto do ajuste vai para o histórico ("Ajustes: …", como a API dos agentes grava); "Enviado para Análise" no lugar de "Movido para pre_revisao" | P11, P15 |
| Bancada | Alteração com o prazo de alteração (selo e ordem da fila) e o "o que mudar" no card da fila | P17 |
| Bancada | Card pego por agente aparece com 🤖 e a etapa; com sinal recente não abre a bancada nem mostra "Devolver"; parado, pode ser devolvido (limpa a etapa do agente) | P16 |
| Controle de Edição | Card mostra a etapa do agente ou "sem sinal há X"; tirar card de agente ativo pede confirmação; reatribuir limpa a etapa do agente | P18 (parte técnica) |

### 4.2 Para os agentes de IA (visibilidade nos quadros)

- **Selo de agente trabalhando** (`AgentWorkBadge`, substitui o `AgentFixBadge`): na Edição "🤖 Editando · Beatriz ·
  cortando", na Alteração "🔧 Em correção · Davi · …". Sem sinal há 30 min ou mais (o limite do `pulse travados`):
  "⏸ Edição/Correção parada · Beatriz · sem sinal há 45 min". Vem de `agent_step`/`agent_heartbeat_at`; só conta
  quando o dono do card é um agente (lista do Escritório Virtual), então uma etapa que sobrou num card passado a um
  humano não aparece. Está no Kanban de Conteúdo, no de Edição, na Bancada (fila), nos detalhes e no Controle de Edição.
- **Parecer da Análise** (`AgentReviewBadge`): "🤖 Análise · aguardando parecer", "✅ Parecer IA: ok · Uriel" ou
  "⚠ Parecer IA: ajustes · Uriel" com o que mudar. Só na Análise (fora dela seria de uma versão antiga).
- **Pronto para a IA** (`AgentReadinessBadge`, regras em `src/lib/agentCardStatus.ts`): aparece só no card que está
  na fila dos agentes (Edição livre ou atribuída a agente sem pegar; Alteração de vídeo feito por agente).
  Verde "🤖 Pronto p/ IA"; âmbar "🤖 IA: falta roteiro, prazo"; vermelho "🤖 IA não pega: falta brutos". O detalhe
  lista item a item.
  - Obrigatório (o `pulse pegar` recusa ou o agente não sabe o que fazer): link dos brutos (`drive_link`), cliente
    cadastrado, tipo reels/story/criativo, e na alteração o texto do ajuste.
  - Recomendado: roteiro (reels e criativo; story costuma ser gravado sem roteiro) e prazo (na alteração, prazo de
    alteração ou imediata).
- **Filtro "Responsável"** nos dois Kanbans: todos, 🤖 com agente de IA, 👤 com a equipe, ⏳ sem responsável,
  ✅ prontos para a IA, ⏸ agente sem sinal. "Com" = responsável ou, sem ele, quem editou.
- Os ids dos agentes vêm de `GET /api/agents/office` (já aberto a toda a equipe), guardados por 5 min (`useAgentIds`).

### 4.3 Mudanças de API (`vps-api-server/agentRoutes.mjs`, pequenas e compatíveis)

| Rota | Mudança |
|---|---|
| Esquema | `content_tasks.agent_review_verdict`, `agent_review_notes`, `agent_review_by`, `agent_review_at` (`ADD COLUMN IF NOT EXISTS`, no `ensureAgentSchema`) |
| `GET /api/agent/queue` | cada card ganha `readiness: { ready, blocked, missing: [{ key, label, blocking }] }` (mesmas regras do selo), `script_id`, `script_alteration_type` ('altered' = não seguir o roteiro original) e o parecer. A ordem e o filtro da fila não mudaram |
| `POST /api/agent/tasks/:id/claim` | a resposta traz `task.adjustments`: todos os pedidos de ajuste (equipe, chefe, cliente pelo portal, pareceres) em ordem, mais o pedido atual do card |
| `GET /api/agent/tasks/:id` (nova) | card completo: campos da fila + `readiness`, parecer com nome, `edited_by_name`, `assigned_to_name`, `adjustments`, `versions` (versão, vídeo, notas, quem, se tem plano) e `history` (30 últimos). Editor lê o card livre da Edição ou que é/foi dele; chefe e revisão, qualquer card. Aceita começo do id (6+ caracteres) |
| `POST /api/agent/tasks/:id/review` (nova) | revisor ou chefe: `{ verdict: 'ok' \| 'ajustes', notes }` (notas obrigatórias no ajustes). Só na Análise ou Revisão. Grava no card e no histórico ("Parecer da Análise"). **Não move o card** |
| `POST /api/agent/tasks/:id/deliver` | a entrega nova apaga o parecer anterior (a versão mudou) |
| `GET /api/agent/tasks?search=` | traz também Drive do cliente e identidade visual, `agent_step`/`agent_heartbeat_at`, imediata/prioridade, roteiro alterado e parecer |

O Drive do cliente (`clients.drive_link`) já saía na fila e no claim como `client_drive_link`.

## 5. O que o CLI (`pulse.mjs`) deveria mostrar

O CLI não foi alterado (outro trabalho cuida dele). Sugestões para quem for mexer:

- `pulse fila`: marcar cada card com o `readiness` — "✓ pronto", "⚠ falta roteiro/prazo" ou "⛔ sem brutos (não dá
  para pegar)" — e pôr os bloqueados no fim; mostrar "ROTEIRO ALTERADO" quando `script_alteration_type = 'altered'`.
- `pulse pegar`: imprimir `adjustments` (todos os pedidos, não só o último), `script_alteration_type` e o parecer.
- `pulse ver <card>`: usar `GET /api/agent/tasks/:id` (hoje lê a fila e, para chefe/revisão, a busca) e mostrar
  versões com as notas, histórico, parecer e readiness.
- Comando novo para o Uriel: `pulse parecer <card> ok|ajustes "mm:ss + o que mudar"` →
  `POST /api/agent/tasks/:id/review`. Continua mandando o recado para a Marcely, que decide; o parecer passa a
  aparecer no card para a equipe.
- `pulse buscar`: mostrar o parecer dos cards em Análise ("✅ ok" / "⚠ ajustes" / "aguardando").
- Fichas do `uriel.md` e `marcely.md`: incluir o `pulse parecer` no passo da Análise (a pasta dos agentes não foi
  alterada).

## 6. Sugestões que dependem do dono

1. **Regra "responsável obrigatório para entrar em Edição"** (P5): no Kanban de Conteúdo, mover para Edição exige
   responsável, e quem é escolhido vira dono — o card sai da fila dos editores e dos agentes. Sugestão: exigir o link
   dos brutos (como já é de Captação para Edição) e deixar o card entrar livre na fila.
2. **Quem move cards no Kanban de Conteúdo** (P23): hoje todo papel que não é editor/videomaker move qualquer card
   para qualquer coluna (inclusive mandar ao cliente). Sugestão: só admin e social media movem de Revisão em diante.
3. **Quem libera da Análise**: deixei Liberar/Devolver só para o admin (a regra é a Marcely decidir). Se a social
   media também deve poder, é uma linha (`userRole === 'admin'` nos dois botões do card e `isAdmin` no detalhe).
4. **Controle de Edição** (P18): editores e videomakers acessam e podem tirar card de colega. Sugestão: só admin e
   gestor de projetos reatribuem; editor só devolve o próprio.
5. **"Aprovar e enviar" com confirmação**: mandar ao cliente pelo botão da Revisão continua com um clique (é a ação
   mais frequente). Se houver muito clique errado, pôr a mesma confirmação do arrastar.
6. **Confirmar Postagem**: continua com um clique; agora cancela a postagem automática. Se preferir, um "Desfazer"
   no aviso por alguns segundos.
7. **Recado automático no parecer**: o `POST …/review` poderia mandar o recado para a chefe (hoje o Uriel manda pelo
   `pulse mandar`). Não fiz para não duplicar recados enquanto o CLI não usa a rota.
8. **Fila humana x fila dos agentes**: a Bancada ordena imediata → prioridade → atrasado → prazo; a fila dos agentes
   põe toda alteração primeiro. Vale alinhar uma regra só.
9. **"Ops! Volta aqui"** não roda o sync: o conteúdo do portal fica em "revisão interna" enquanto o card volta para
   a Edição. Sugestão: sync da coluna Edição (sem aviso ao cliente, que já é o comportamento da volta).

## 7. Testes

- `npx tsc --noEmit -p tsconfig.app.json`: 0 erros.
- `npx vitest run`: 119 testes (88 antes). Novos: `agentCardStatus.test.ts` (prontidão, estado do agente, filtro,
  parecer), `kanbanAgentBadges.test.tsx` (selos), `contentKanbanFlow.test.tsx` e `editorKanbanFlow.test.tsx`
  (fumaça das páginas com servidor simulado: setas pelo fluxo, Análise, pedido de ajuste ao devolver, detalhe em
  qualquer card, confirmação ao aprovar).
- `npx vite build`: ok.
- `node --check vps-api-server/agentRoutes.mjs`: ok.
- Ponta a ponta contra Postgres (banco `pulse_conteudo`): o teste de agentes existente passa inteiro; um teste novo
  cobre readiness na fila, histórico de ajustes no claim, parecer (papéis, validação, coluna, histórico, não move),
  card completo (permissões, versões) e a entrega apagando o parecer.

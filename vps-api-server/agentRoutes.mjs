// ─── Agentes de edição (Fase 1) ─────────────────────────────
// Membros da equipe que trabalham por uma chave própria (não por login no navegador):
// editores (pegam e entregam vídeos), revisor e chefe. Cada chave pertence a um
// profile real, então "editado por", histórico e relatórios mostram o nome dele.
//
// Rotas de administração (JWT de admin):
//   GET    /api/agent-keys              lista as chaves (sem o segredo)
//   POST   /api/agent-keys              { user_id, role } → devolve a chave UMA vez
//   DELETE /api/agent-keys/:id          revoga
//   GET    /api/agents/overview         painel: agentes, card atual, entregas, fila, atividade
//   GET    /api/agents/office           Escritório Virtual: agente online só enquanto executa
//   POST   /api/agents/pause|resume     { scope: 'all' | <user_id> } — pausado = não pega card novo
//   GET    /api/agent-machines          computadores conectados e os agentes de cada um
//   POST   /api/agent-machines          { name, user_ids } → cadastra o Mac e devolve um código de conexão (30 min, uso único)
//   POST   /api/agent-machines/:id/code { user_ids } → novo código para o mesmo Mac (trocar/acrescentar agentes)
//   PATCH  /api/agent-machines/:id      { name }
//   DELETE /api/agent-machines/:id      desconecta: revoga as chaves dos agentes daquele Mac
//   GET    /api/agent-machines/:id/pair  andamento da conexão ao vivo (a tela consulta enquanto o Mac conecta)
//   POST   /api/agent-machines/sync-clients  "Sincronizar clientes": pede à chefe para publicar e aos outros Macs para baixar
//
// Conexão de um Mac (sem login; o código é a autorização):
//   POST /api/agent-pair                { code, hostname } → chaves novas dos agentes escolhidos, presas ao Mac
//                                       (as chaves antigas desses agentes, em qualquer outro Mac, são revogadas)
//   POST /api/agent/clients-bundle      (chefe) multipart: bundle (tar.gz) + manifest → nova versão dos clientes
//                                       (mapa.json, agentes/, CLAUDE.md/marca/grade de cada cliente); avisa os outros Macs
//   GET  /api/agent/clients-bundle[?meta=1]   versão atual (com a lista de arquivos e sha256, sem ?meta=1)
//   GET  /api/agent/clients-bundle/download   o tar.gz da versão atual
//   POST /api/agent/clients-bundle/applied    { version } o Mac aplicou essa versão
//   POST /api/agent/machine/report      (chave do Mac) { stage, checks, done } → o Mac conta ao sistema cada etapa
//                                       e o resultado da verificação (Node, ffprobe, pasta OPEN CUT, mapa, chaves)
//
// Rotas do agente (cabeçalho "Authorization: Agent <chave>"):
//   GET  /api/agent/me
//   GET  /api/agent/queue               fila de edição (alterações primeiro), com readiness (o que falta para pegar)
//   GET  /api/agent/tasks/:id           card completo: readiness, parecer, histórico de ajustes, versões, histórico
//   POST /api/agent/tasks/:id/review    (revisor, chefe) { verdict: ok|ajustes, notes } parecer da Análise no card
//   POST /api/agent/tasks/:id/claim     assume o card (atômico); devolve também o histórico de ajustes
//   POST /api/agent/tasks/:id/heartbeat { step }   sinal de vida + etapa atual
//   POST /api/agent/tasks/:id/release   { reason } devolve o card para a fila
//   POST /api/agent/tasks/:id/deliver   multipart: video (mp4), plan (json, opcional), notes
//   POST /api/agent/tasks/:id/deliver-stories  multipart: stories[] + names (JSON) → um card de story por vídeo
//   GET  /api/agent/stale?minutes=30    (chefe) cards de agentes sem sinal de vida
//   GET  /api/agent/clients?search=     nicho, linha editorial e links do cliente
//   GET  /api/agent/tasks?search=       (chefe, revisor) busca cards do fluxo de edição em qualquer coluna
//   POST /api/agent/tasks/:id/move      (chefe) { column: edicao|revisao|alteracao, reason, adjustment_notes }
//   POST /api/agent/tasks/:id/type      (chefe) { content_type: reels|story|criativo, reason } corrige o tipo de um card da edição
//   POST /api/agent/tasks/:id/assign    (chefe) { to: nome do agente editor, reason } passa um card de edição/alteração
//                                       para um agente — só se quem está com ele não mexeu nas últimas 24 h
//   POST /api/agent/messages            { to: nome | "todos", body } recado entre agentes (qualquer computador)
//   GET  /api/agent/messages            caixa de entrada (devolve não lidos e marca como lidos)
//   POST /api/agent/status              { status } trabalhando (online 15 min) | { done: true } encerrou
//
// A entrega reproduz no servidor o que o navegador faz em
// src/lib/contentTaskSync.ts ao mover um card para "revisao".

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';

// designer e revisor_arte: agentes de design (rotas em agentDesignRoutes.mjs)
// triagem: varre o Drive e só cria cards (rotas em agentTriageRoutes.mjs)
// colorista (Íris) e som (Caio), desde 31/10/2026: trabalham no projeto que o editor passa por recado; mandam
// etapa nos cards do fluxo de edição, mas não pegam card da fila
// roteirista (Victoria, desde 01/11/2026): escreve roteiros no módulo Copy (victoriaRoutes.mjs); não pega card
const AGENT_ROLES = new Set(['editor', 'revisor', 'chefe', 'designer', 'revisor_arte', 'triagem', 'colorista', 'som', 'roteirista']);
const DESIGN_ONLY_ROLES = new Set(['designer', 'revisor_arte']);
const SUPPORT_ROLES = new Set(['colorista', 'som']);
// quem não edita vídeo: fila de edição vazia e o claim recusa
const NO_VIDEO_ROLES = new Set([...DESIGN_ONLY_ROLES, 'triagem', ...SUPPORT_ROLES, 'roteirista']);
// marcadores dos ajustes de um card em Alteração depois que o revisor traduz o pedido (o gatilho do banco lê o primeiro)
const TRADUCAO_ALTERACAO = '🧭 TRADUÇÃO DA ALTERAÇÃO';
const ORIGINAL_ALTERACAO = '\n\n— Pedido original da equipe: ';
const TZ = 'America/Sao_Paulo';
const WEEKDAY_TO_KEY = { Sun: 'domingo', Mon: 'segunda', Tue: 'terca', Wed: 'quarta', Thu: 'quinta', Fri: 'sexta', Sat: 'sabado' };

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function weekdayKeyInBrazil(date) {
  const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TZ }).format(date);
  return WEEKDAY_TO_KEY[short];
}

function brazilDateString(date) {
  // yyyy-MM-dd no fuso de Brasília (igual ao format() do navegador da equipe)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Mesmo cálculo de addBusinessHours do front: soma dias úteis inteiros mantendo o horário. */
export function addBusinessHours(from, hours, workDays) {
  let daysToAdd = Math.ceil(hours / 24);
  let current = new Date(from.getTime());
  while (daysToAdd > 0) {
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    if (workDays.includes(weekdayKeyInBrazil(current))) daysToAdd--;
  }
  return current;
}

export function registerAgentRoutes(app, { pool, uploadRoot, verifyUser, isStrictAdmin, publicUploadsUrl }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');

  // ── Esquema ───────────────────────────────────────────────
  let schemaPromise = null;
  function ensureAgentSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            role TEXT NOT NULL DEFAULT 'editor',
            key_hash TEXT NOT NULL UNIQUE,
            key_hint TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_used_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS edit_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            task_id UUID NOT NULL,
            version INTEGER NOT NULL,
            video_url TEXT NOT NULL,
            plan JSONB,
            notes TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (task_id, version)
          )
        `);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_step TEXT`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_heartbeat_at TIMESTAMPTZ`);
        // quem mandou a última etapa (o editor do card, ou a revisão/chefe conferindo): o selo do card mostra o nome
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_step_by UUID`);
        // usado pela divisão de pacotes (otimização e stories) em cards filhos; não existia em produção
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID`);
        // parecer do revisor IA na Análise (POST /api/agent/tasks/:id/review); a entrega nova apaga
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_review_verdict TEXT`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_review_notes TEXT`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_review_by UUID`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS agent_review_at TIMESTAMPTZ`);
        // "Fixar" no Kanban de Edição: card reservado para a equipe presencial, fora da fila dos agentes
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS pinned_by UUID`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_edit_versions_task ON edit_versions(task_id, version DESC)`).catch(() => {});
        // atividade geral (chefe, revisão, editor entre cards): online enquanto o status for recente
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_activity (
            user_id UUID PRIMARY KEY,
            status TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        // recados entre agentes (funciona entre computadores diferentes)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            from_user UUID,
            to_user UUID NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            read_at TIMESTAMPTZ
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(to_user, read_at)`).catch(() => {});
        // 🔥 Urgência (pedido do usuário, 31/10/2026): botão nos cards de Edição, Análise e Alteração, ou a alteração
        // pedida com urgência na Revisão. Urgente = prioridade total: topo da fila dos agentes e recado na hora para
        // quem está com o vídeo (editor; na Análise, a revisão) e para a chefe. Sai sozinha quando o card deixa o
        // fluxo de edição (ex.: liberado para a Revisão). Gravado pelo navegador; os gatilhos fazem o resto.
        // ⏸ Aguardando material (31/10/2026): card em Edição/Alteração que não dá para fazer até chegar algo (bruto,
        // projeto em outro computador, resposta do cliente). Fica no fim da fila e não trava o editor de pegar outro.
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS waiting_material_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS waiting_material_note TEXT`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS urgent_at TIMESTAMPTZ`);
        await pool.query(`ALTER TABLE content_tasks ADD COLUMN IF NOT EXISTS urgent_by UUID`);
        await pool.query(`
          CREATE OR REPLACE FUNCTION pulse_urgencia_limpa() RETURNS trigger AS $fn$
          BEGIN
            -- "Alteração com urgência" (a caixa do pedido de ajustes, em qualquer tela) liga a urgência
            IF NEW.kanban_column = 'alteracao' AND NEW.immediate_alteration IS TRUE AND NEW.urgent_at IS NULL
               AND (OLD.immediate_alteration IS NOT TRUE OR OLD.kanban_column IS DISTINCT FROM 'alteracao') THEN
              NEW.urgent_at := now();
            END IF;
            -- aguardando material sai sozinho quando o card sai de Edição/Alteração ou quando o link dos brutos chega
            IF NEW.waiting_material_at IS NOT NULL AND (NEW.kanban_column NOT IN ('edicao', 'alteracao')
               OR (COALESCE(OLD.drive_link, '') = '' AND COALESCE(NEW.drive_link, '') <> '')) THEN
              NEW.waiting_material_at := NULL;
              NEW.waiting_material_note := NULL;
            END IF;
            IF NEW.urgent_at IS NOT NULL AND NEW.kanban_column NOT IN ('edicao', 'pre_revisao', 'alteracao') THEN
              NEW.urgent_at := NULL;
              NEW.urgent_by := NULL;
            END IF;
            RETURN NEW;
          END
          $fn$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_content_tasks_urgencia_limpa ON content_tasks`);
        await pool.query(`
          CREATE TRIGGER trg_content_tasks_urgencia_limpa BEFORE UPDATE OF kanban_column, urgent_at, immediate_alteration, drive_link ON content_tasks
            FOR EACH ROW EXECUTE FUNCTION pulse_urgencia_limpa()
        `);
        await pool.query(`
          CREATE OR REPLACE FUNCTION pulse_urgencia_avisa() RETURNS trigger AS $fn$
          DECLARE
            chefe UUID;
            alvo UUID;
            onde TEXT;
          BEGIN
            -- só quando a urgência acaba de ser ligada, ou o card urgente muda de coluna (ex.: entregue → Análise)
            IF NEW.urgent_at IS NULL
               OR (OLD.urgent_at IS NOT NULL AND OLD.kanban_column IS NOT DISTINCT FROM NEW.kanban_column) THEN
              RETURN NULL;
            END IF;
            SELECT k.user_id INTO chefe FROM agent_keys k JOIN profiles p ON p.id = k.user_id
              WHERE k.revoked_at IS NULL AND k.role = 'chefe' AND p.name NOT ILIKE 'severino%'
              ORDER BY k.created_at DESC LIMIT 1;
            onde := CASE NEW.kanban_column WHEN 'edicao' THEN 'Edição' WHEN 'pre_revisao' THEN 'Análise' ELSE 'Alteração' END;
            IF NEW.kanban_column = 'pre_revisao' THEN
              SELECT user_id INTO alvo FROM agent_keys WHERE revoked_at IS NULL AND role = 'revisor'
                ORDER BY created_at DESC LIMIT 1;
              IF alvo IS NOT NULL THEN
                INSERT INTO agent_messages (from_user, to_user, body) VALUES (chefe, alvo,
                  '🔥 URGENTE na Análise (prioridade total, marcado pela equipe): "' || NEW.title || '" · card ' || NEW.id ||
                  '. Confira este antes de qualquer outro e mande o parecer na hora.');
              END IF;
            ELSE
              SELECT user_id INTO alvo FROM agent_keys WHERE revoked_at IS NULL AND role = 'editor'
                AND user_id IN (NEW.assigned_to, NEW.edited_by)
                ORDER BY (user_id IS NOT DISTINCT FROM NEW.assigned_to) DESC LIMIT 1;
              IF alvo IS NOT NULL THEN
                INSERT INTO agent_messages (from_user, to_user, body) VALUES (chefe, alvo,
                  '🔥 URGENTE em ' || onde || ' (prioridade total, marcado pela equipe): "' || NEW.title || '" · card ' || NEW.id ||
                  '. Termine só o render ou a transcrição que já está rodando, pare o resto e faça este agora (pulse ver).');
              END IF;
            END IF;
            IF chefe IS NOT NULL AND chefe IS DISTINCT FROM alvo THEN
              INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, chefe,
                '🔥 URGENTE em ' || onde || ': "' || NEW.title || '" · card ' || NEW.id ||
                CASE WHEN alvo IS NULL THEN '. Nenhum agente com o card: atribua agora.' ELSE '. O agente do card já foi avisado.' END);
            END IF;
            RETURN NULL;
          EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
          END
          $fn$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_content_tasks_urgencia_avisa ON content_tasks`);
        await pool.query(`
          CREATE TRIGGER trg_content_tasks_urgencia_avisa AFTER UPDATE OF urgent_at, kanban_column, immediate_alteration ON content_tasks
            FOR EACH ROW EXECUTE FUNCTION pulse_urgencia_avisa()
        `);
        // 📦 Ficha do bruto (31/10/2026, "usa o Severino mesmo"): card de vídeo que entra em Edição com o link dos
        // brutos (ou ganha o link lá) vira recado para o agente de triagem, que baixa os brutos e deixa a ficha para o
        // editor (duração, HDR, luz, ruído, contagem nas pontas). Sem consulta em laço: o recado acorda o pulse esperar.
        await pool.query(`
          CREATE OR REPLACE FUNCTION pulse_bruto_avisa_triagem() RETURNS trigger AS $fn$
          DECLARE
            triagem UUID;
          BEGIN
            IF NEW.kanban_column <> 'edicao' OR COALESCE(NEW.drive_link, '') = ''
               OR NEW.content_type NOT IN ('reels', 'story', 'criativo') THEN
              RETURN NULL;
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.kanban_column IS NOT DISTINCT FROM NEW.kanban_column
               AND COALESCE(OLD.drive_link, '') = COALESCE(NEW.drive_link, '') THEN
              RETURN NULL;
            END IF;
            SELECT user_id INTO triagem FROM agent_keys WHERE revoked_at IS NULL AND role = 'triagem'
              ORDER BY created_at DESC LIMIT 1;
            IF triagem IS NOT NULL THEN
              INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, triagem,
                '📦 BRUTO NOVO: "' || NEW.title || '" · card ' || NEW.id || ' · ' || NEW.drive_link ||
                '. Baixe os brutos e faça a ficha do bruto (ferramentas/video/ficha-bruto.mjs).');
            END IF;
            RETURN NULL;
          EXCEPTION WHEN OTHERS THEN
            RETURN NULL;
          END
          $fn$ LANGUAGE plpgsql
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_content_tasks_bruto_triagem ON content_tasks`);
        await pool.query(`
          CREATE TRIGGER trg_content_tasks_bruto_triagem AFTER INSERT OR UPDATE OF kanban_column, drive_link ON content_tasks
            FOR EACH ROW EXECUTE FUNCTION pulse_bruto_avisa_triagem()
        `);
        // computadores onde os agentes rodam (Mac 1, Mac 2…) e os códigos de conexão de uso único
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_machines (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            hostname TEXT,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            connected_at TIMESTAMPTZ,
            last_seen_at TIMESTAMPTZ,
            revoked_at TIMESTAMPTZ
          )
        `);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_pair_codes (
            code_hash TEXT PRIMARY KEY,
            machine_id UUID NOT NULL,
            user_ids JSONB NOT NULL,
            created_by UUID,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ
          )
        `);
        await pool.query(`ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS machine_id UUID`);
        // conexão ao vivo: aguardando → chaves_entregues → chaves_gravadas → conectado | com_avisos
        await pool.query(`ALTER TABLE agent_machines ADD COLUMN IF NOT EXISTS pair_status TEXT`);
        await pool.query(`ALTER TABLE agent_machines ADD COLUMN IF NOT EXISTS pair_report JSONB`);
        await pool.query(`ALTER TABLE agent_machines ADD COLUMN IF NOT EXISTS pair_updated_at TIMESTAMPTZ`);
        // sincronização de clientes entre os Macs (o arquivo fica numa pasta privada, fora de /uploads)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_client_bundles (
            version SERIAL PRIMARY KEY,
            sha256 TEXT NOT NULL,
            size_bytes BIGINT NOT NULL,
            file_count INTEGER NOT NULL,
            client_count INTEGER NOT NULL,
            manifest JSONB NOT NULL,
            file_name TEXT NOT NULL,
            created_by UUID,
            machine_id UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        await pool.query(`ALTER TABLE agent_machines ADD COLUMN IF NOT EXISTS clients_version INTEGER`);
        await pool.query(`ALTER TABLE agent_machines ADD COLUMN IF NOT EXISTS clients_synced_at TIMESTAMPTZ`);
        // pausa: scope = 'all' (todos) ou o user_id de um agente; existir a linha = pausado
        await pool.query(`
          CREATE TABLE IF NOT EXISTS agent_pauses (
            scope TEXT PRIMARY KEY,
            paused_by UUID,
            paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reason TEXT
          )
        `);
        // Alteração pedida pelo sistema é prioridade (pedido do dono em 30/10/2026). O banco avisa na hora, sem ninguém
        // consultar a fila: card que entra em Alteração (ou ganha ajustes novos lá) vai primeiro ao revisor, que traduz a
        // escrita da equipe no que fazer com precisão (POST /api/agent/tasks/:id/translation grava a tradução no começo dos
        // ajustes, com o marcador TRADUCAO_ALTERACAO); ajustes que já começam pelo marcador vão ao agente do card
        // (atribuído, senão quem editou). Sem revisor ativo, vai direto ao agente; card sem agente, à chefe atribuir.
        // O `pulse esperar` de quem recebe acorda com o recado. Falha aqui nunca impede a mudança do card.
        await pool.query(`
          CREATE OR REPLACE FUNCTION pulse_alteracao_avisa_agente() RETURNS trigger
          LANGUAGE plpgsql AS $fn$
          DECLARE
            destino UUID;
            revisor UUID;
            editor TEXT;
            cliente TEXT;
            texto TEXT;
            chefe RECORD;
          BEGIN
            BEGIN
              IF NEW.kanban_column = 'alteracao' AND (OLD.kanban_column IS DISTINCT FROM 'alteracao'
                  OR OLD.adjustment_notes IS DISTINCT FROM NEW.adjustment_notes) THEN
                SELECT k.user_id, trim(p.name) INTO destino, editor FROM agent_keys k JOIN profiles p ON p.id = k.user_id
                 WHERE k.revoked_at IS NULL AND k.role = 'editor' AND k.user_id IN (NEW.assigned_to, NEW.edited_by)
                 ORDER BY (k.user_id = NEW.assigned_to) DESC LIMIT 1;
                SELECT trim(c.company_name) INTO cliente FROM clients c WHERE c.id = NEW.client_id;
                IF coalesce(NEW.adjustment_notes, '') NOT LIKE '${TRADUCAO_ALTERACAO}%' THEN
                  SELECT user_id INTO revisor FROM agent_keys WHERE revoked_at IS NULL AND role = 'revisor' LIMIT 1;
                END IF;
                IF revisor IS NOT NULL THEN
                  INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, revisor,
                    '🧭 TRADUZIR ALTERAÇÃO antes do editor: ' || NEW.id || ' · ' || coalesce(cliente, 'avulso') || ' — '
                    || coalesce(NEW.title, '') || ' (editor: ' || coalesce(editor, 'sem agente') || '). A equipe escreveu: "'
                    || coalesce(left(regexp_replace(NEW.adjustment_notes, '\\s+', ' ', 'g'), 1500), '')
                    || '". Veja a versão anterior nos mm:ss citados e grave o que fazer com precisão (mm:ss, o quê, como, o que'
                    || ' não mexer) com: pulse traduzir ' || NEW.id || ' "…". O sistema avisa o editor em seguida.');
                  RETURN NULL;
                END IF;
                texto := '🔧 ALTERAÇÃO PRIORITÁRIA pelo sistema: ' || NEW.id || ' · ' || coalesce(cliente, 'avulso') || ' — '
                  || coalesce(NEW.title, '') || '. Ajustes: "'
                  || coalesce(left(regexp_replace(NEW.adjustment_notes, '\\s+', ' ', 'g'), 1500), 'ver no card')
                  || '". Regra do dono: alteração do sistema vem antes de card novo (termine só o render/transcrição em'
                  || ' andamento); só fica atrás de pedido que ele fez direto no seu chat.';
                IF destino IS NOT NULL THEN
                  INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, destino, texto);
                END IF;
                -- sem agente no card: a chefe atribui (a chave de triagem do Severino também é 'chefe' e fica de fora)
                IF destino IS NULL THEN
                  FOR chefe IN SELECT DISTINCT k.user_id FROM agent_keys k JOIN profiles p ON p.id = k.user_id
                                WHERE k.revoked_at IS NULL AND k.role = 'chefe' AND p.name NOT ILIKE 'severino%' LOOP
                    INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, chefe.user_id, texto || ' Card sem agente: atribua.');
                  END LOOP;
                END IF;
              END IF;
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING 'pulse_alteracao_avisa_agente: %', SQLERRM;
            END;
            RETURN NULL;
          END
          $fn$
        `);
        await pool.query(`DROP TRIGGER IF EXISTS trg_content_tasks_alteracao_agente ON content_tasks`);
        await pool.query(`
          CREATE TRIGGER trg_content_tasks_alteracao_agente AFTER UPDATE OF kanban_column, adjustment_notes
          ON content_tasks FOR EACH ROW EXECUTE FUNCTION pulse_alteracao_avisa_agente()
        `);
      })().catch((error) => {
        schemaPromise = null;
        throw error;
      });
    }
    return schemaPromise;
  }
  ensureAgentSchema().catch((error) => console.error('Failed to ensure agent schema:', error));

  // ── Autenticação do agente ────────────────────────────────
  async function verifyAgent(req) {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Agent ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    const raw = header.slice('Agent '.length).trim();
    if (!raw) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    await ensureAgentSchema();
    const { rows } = await pool.query(
      `SELECT k.id, k.user_id, k.role, k.machine_id, p.name, p.email
         FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
        WHERE k.key_hash = $1 AND k.revoked_at IS NULL
        LIMIT 1`,
      [hashKey(raw)]
    );
    if (!rows.length) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    pool.query('UPDATE agent_keys SET last_used_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});
    if (rows[0].machine_id) {
      pool.query('UPDATE agent_machines SET last_seen_at = now() WHERE id = $1', [rows[0].machine_id]).catch(() => {});
    }
    return { keyId: rows[0].id, userId: rows[0].user_id, role: rows[0].role, name: rows[0].name, email: rows[0].email };
  }

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
    if (status >= 500) console.error('[agent] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  async function logHistory(taskId, userId, action, details = null) {
    await pool.query(
      'INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [taskId, userId, action, details]
    ).catch((error) => console.error('[agent] task_history:', error.message));
  }

  async function pauseStateFor(userId) {
    const { rows } = await pool.query(
      `SELECT scope, paused_at, reason FROM agent_pauses WHERE scope = 'all' OR scope = $1`,
      [String(userId)]
    );
    const all = rows.find((r) => r.scope === 'all');
    const own = rows.find((r) => r.scope !== 'all');
    return { paused: rows.length > 0, all: !!all, own: !!own, reason: (all || own)?.reason || null };
  }

  // ── Administração das chaves ──────────────────────────────
  app.get('/api/agent-keys', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const { rows } = await pool.query(
        `SELECT k.id, k.user_id, k.role, k.key_hint, k.created_at, k.last_used_at, k.revoked_at, p.name, p.email,
                k.machine_id, m.name AS machine_name
           FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
           LEFT JOIN agent_machines m ON m.id = k.machine_id
          ORDER BY k.revoked_at NULLS FIRST, k.created_at DESC`
      );
      res.json({ keys: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent-keys', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const userId = String(req.body?.user_id || '').trim();
      const role = String(req.body?.role || 'editor').trim();
      if (!userId) return res.status(400).json({ error: 'Escolha o membro da equipe' });
      if (!AGENT_ROLES.has(role)) return res.status(400).json({ error: 'Papel inválido' });
      const { rows: profiles } = await pool.query('SELECT id, name FROM profiles WHERE id = $1', [userId]);
      if (!profiles.length) return res.status(404).json({ error: 'Membro não encontrado' });

      const raw = `pa_${crypto.randomBytes(32).toString('base64url')}`;
      const { rows } = await pool.query(
        `INSERT INTO agent_keys (user_id, role, key_hash, key_hint, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [userId, role, hashKey(raw), raw.slice(-4), user.id]
      );
      res.json({ id: rows[0].id, key: raw, name: profiles[0].name, role });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/agent-keys/:id', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      await pool.query('UPDATE agent_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Computadores (Macs) onde os agentes rodam ─────────────
  const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I
  const PAIR_TTL_MIN = 30;
  const pairFailures = new Map(); // ip → { count, until }

  function newPairCode() {
    const bytes = crypto.randomBytes(10);
    const chars = Array.from(bytes, (b) => PAIR_ALPHABET[b % PAIR_ALPHABET.length]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  }
  const normalizePairCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const agentSlug = (name) => String(name || '').trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'agente';

  async function requireAdmin(req) {
    const { user } = await verifyUser(req);
    if (!(await isStrictAdmin(user))) throw Object.assign(new Error('Apenas administradores'), { status: 403 });
    await ensureAgentSchema();
    return user;
  }

  // quem já teve chave de agente, ativa ou revogada (ex.: Davi indo para o Mac 2 depois de revogar a chave antiga);
  // a função vem da chave mais recente
  async function validAgentIds(userIds) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String).filter(Boolean))];
    if (!ids.length) throw Object.assign(new Error('Escolha pelo menos um agente para este Mac'), { status: 400 });
    const { rows } = await pool.query(
      `SELECT DISTINCT user_id::text FROM agent_keys WHERE user_id::text = ANY($1)`,
      [ids]
    );
    if (rows.length !== ids.length) {
      throw Object.assign(new Error('Algum membro escolhido nunca foi agente. Gere a chave dele em "Agentes de edição" primeiro.'), { status: 400 });
    }
    return ids;
  }

  async function issuePairCode(machineId, userIds, createdBy) {
    const code = newPairCode();
    // um código válido por Mac: o anterior deixa de valer
    await pool.query('DELETE FROM agent_pair_codes WHERE machine_id = $1 AND used_at IS NULL', [machineId]);
    await pool.query(
      `INSERT INTO agent_pair_codes (code_hash, machine_id, user_ids, created_by, expires_at)
       VALUES ($1, $2, $3::jsonb, $4, now() + ($5 || ' minutes')::interval)`,
      [hashKey(normalizePairCode(code)), machineId, JSON.stringify(userIds), createdBy, String(PAIR_TTL_MIN)]
    );
    await pool.query(
      `UPDATE agent_machines SET pair_status = 'aguardando', pair_report = NULL, pair_updated_at = now() WHERE id = $1`,
      [machineId]
    );
    return { code, expires_in_minutes: PAIR_TTL_MIN };
  }

  app.get('/api/agent-machines', async (req, res) => {
    try {
      await requireAdmin(req);
      const { rows: machines } = await pool.query(
        `SELECT m.id, m.name, m.hostname, m.created_at, m.connected_at, m.last_seen_at, m.pair_status, m.pair_report,
                m.clients_version, m.clients_synced_at,
                EXISTS (SELECT 1 FROM agent_pair_codes c WHERE c.machine_id = m.id AND c.used_at IS NULL AND c.expires_at > now()) AS code_pending
           FROM agent_machines m WHERE m.revoked_at IS NULL ORDER BY m.created_at`
      );
      const { rows: agents } = await pool.query(
        `SELECT DISTINCT ON (k.user_id) k.user_id, k.role, k.last_used_at, p.name, p.email, p.avatar_url,
                (k.revoked_at IS NULL) AS active,
                CASE WHEN k.revoked_at IS NULL THEN k.machine_id END AS machine_id
           FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
          ORDER BY k.user_id, k.created_at DESC`
      );
      const { rows: bundles } = await pool.query(
        `SELECT b.version, b.size_bytes, b.file_count, b.client_count, b.created_at, b.machine_id, p.name AS created_by_name
           FROM agent_client_bundles b LEFT JOIN profiles p ON p.id = b.created_by
          ORDER BY b.version DESC LIMIT 1`
      );
      res.json({ machines, agents, clients_bundle: bundles[0] || null });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent-machines', async (req, res) => {
    try {
      const user = await requireAdmin(req);
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Dê um nome ao computador (ex.: Mac 2)' });
      const userIds = await validAgentIds(req.body?.user_ids);
      const { rows } = await pool.query(
        'INSERT INTO agent_machines (name, created_by) VALUES ($1, $2) RETURNING id, name',
        [name, user.id]
      );
      res.json({ machine: rows[0], ...(await issuePairCode(rows[0].id, userIds, user.id)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent-machines/:id/code', async (req, res) => {
    try {
      const user = await requireAdmin(req);
      const { rows } = await pool.query('SELECT id, name FROM agent_machines WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Computador não encontrado' });
      const userIds = await validAgentIds(req.body?.user_ids);
      res.json({ machine: rows[0], ...(await issuePairCode(rows[0].id, userIds, user.id)) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.patch('/api/agent-machines/:id', async (req, res) => {
    try {
      await requireAdmin(req);
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Nome vazio' });
      await pool.query('UPDATE agent_machines SET name = $2 WHERE id = $1 AND revoked_at IS NULL', [req.params.id, name]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/agent-machines/:id', async (req, res) => {
    try {
      await requireAdmin(req);
      await pool.query('UPDATE agent_keys SET revoked_at = now() WHERE machine_id = $1 AND revoked_at IS NULL', [req.params.id]);
      await pool.query('DELETE FROM agent_pair_codes WHERE machine_id = $1', [req.params.id]);
      await pool.query('UPDATE agent_machines SET revoked_at = now() WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Sincronização de clientes entre os Macs ───────────────
  const bundleDir = path.resolve(process.env.AGENT_PRIVATE_DIR || path.join(os.homedir(), 'pulse-agent-private'), 'clientes');
  const MANIFEST_PATH = /^(clientes|agentes)\/[^\0]+$/;
  const BLOCKED_PATH = /(^|\/)(\.\.|node_modules|brutos)(\/|$)|\.(env|key|pem|p12|mp4|mov|m4v|mxf|avi)$|(^|\/)\.env/i;

  async function latestBundle(withManifest) {
    const { rows } = await pool.query(
      `SELECT b.version, b.sha256, b.size_bytes, b.file_count, b.client_count, b.file_name, b.created_at, b.machine_id,
              ${withManifest ? 'b.manifest,' : ''} p.name AS created_by_name
         FROM agent_client_bundles b LEFT JOIN profiles p ON p.id = b.created_by
        ORDER BY b.version DESC LIMIT 1`
    );
    return rows[0] || null;
  }

  async function machineOfKey(keyId) {
    const { rows } = await pool.query('SELECT machine_id FROM agent_keys WHERE id = $1', [keyId]);
    return rows[0]?.machine_id || null;
  }

  // avisa os agentes dos outros Macs (Macs conectados, diferentes de quem publicou) que há versão nova
  async function notifyOtherMachines(fromUser, publisherMachine, version, byName) {
    const { rows } = await pool.query(
      `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
        WHERE k.revoked_at IS NULL AND k.machine_id IS NOT NULL AND k.machine_id IS DISTINCT FROM $1`,
      [publisherMachine]
    );
    for (const r of rows) {
      const slug = agentSlug(r.name);
      await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [
        fromUser, r.user_id,
        `Clientes atualizados (versão ${version}, por ${byName}). Rode \`pulse --agente ${slug} baixar-clientes\`, confira o que muda e aplique com --aplicar.`,
      ]);
    }
    return rows.map((r) => r.name.trim());
  }

  const bundleUpload = multer({
    storage: multer.diskStorage({
      destination(_req, _file, cb) {
        try {
          fs.mkdirSync(bundleDir, { recursive: true, mode: 0o700 });
          cb(null, bundleDir);
        } catch (error) {
          cb(error);
        }
      },
      filename(_req, _file, cb) {
        cb(null, `clientes_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.tar.gz`);
      },
    }),
    // clientes sem fotos ficam em ~16 MB; acima de 60 MB algo pesado entrou por engano
    limits: { fileSize: 60 * 1024 * 1024, files: 1, fieldSize: 5 * 1024 * 1024 },
  }).single('bundle');

  app.post('/api/agent/clients-bundle', async (req, res) => {
    let agent;
    try {
      agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Só a chefe publica os clientes (o Mac principal)' });
      await ensureAgentSchema();
    } catch (error) {
      return sendError(res, error);
    }
    bundleUpload(req, res, async (uploadError) => {
      const discard = () => req.file && fs.promises.unlink(req.file.path).catch(() => {});
      try {
        if (uploadError) throw Object.assign(uploadError, { status: uploadError.status || 400 });
        if (!req.file) return res.status(400).json({ error: 'Envie o pacote (bundle)' });
        let manifest;
        try {
          manifest = JSON.parse(String(req.body?.manifest || ''));
        } catch {
          discard();
          return res.status(400).json({ error: 'Manifesto inválido' });
        }
        const files = Array.isArray(manifest?.files) ? manifest.files : [];
        const bad = files.find((f) => !MANIFEST_PATH.test(String(f?.path || '')) || BLOCKED_PATH.test(String(f.path)) || !/^[a-f0-9]{64}$/.test(String(f?.sha256 || '')));
        if (!files.length || bad) {
          discard();
          return res.status(400).json({ error: bad ? `Arquivo não permitido no pacote: ${bad.path}` : 'Pacote vazio' });
        }
        if (!files.some((f) => f.path === 'clientes/mapa.json')) {
          discard();
          return res.status(400).json({ error: 'O pacote precisa ter clientes/mapa.json' });
        }
        // hash em fluxo: não carrega o pacote inteiro na memória (a VPS é pequena)
        const sha256 = await new Promise((resolve, reject) => {
          const hash = crypto.createHash('sha256');
          fs.createReadStream(req.file.path).on('data', (chunk) => hash.update(chunk)).on('error', reject)
            .on('end', () => resolve(hash.digest('hex')));
        });
        const clientCount = Number(manifest.client_count) || 0;
        const machineId = await machineOfKey(agent.keyId);
        const { rows } = await pool.query(
          `INSERT INTO agent_client_bundles (sha256, size_bytes, file_count, client_count, manifest, file_name, created_by, machine_id)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING version, created_at`,
          [sha256, req.file.size, files.length, clientCount,
            JSON.stringify({ files: files.map((f) => ({ path: String(f.path), sha256: String(f.sha256), size: Number(f.size) || 0 })) }),
            path.basename(req.file.path), agent.userId, machineId]
        );
        const version = rows[0].version;
        if (machineId) {
          await pool.query('UPDATE agent_machines SET clients_version = $2, clients_synced_at = now() WHERE id = $1', [machineId, version]);
        }
        // guarda só as 5 últimas versões no disco
        const { rows: old } = await pool.query('SELECT file_name FROM agent_client_bundles ORDER BY version DESC OFFSET 5');
        for (const o of old) fs.promises.unlink(path.join(bundleDir, o.file_name)).catch(() => {});
        const notified = await notifyOtherMachines(agent.userId, machineId, version, agent.name?.trim() || 'a chefe');
        res.json({ ok: true, version, sha256, size_bytes: req.file.size, file_count: files.length, notified });
      } catch (error) {
        discard();
        sendError(res, error);
      }
    });
  });

  app.get('/api/agent/clients-bundle', async (req, res) => {
    try {
      await verifyAgent(req);
      await ensureAgentSchema();
      const bundle = await latestBundle(req.query.meta !== '1');
      if (!bundle) return res.status(404).json({ error: 'Nenhuma versão de clientes publicada ainda' });
      delete bundle.file_name;
      res.json(bundle);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent/clients-bundle/download', async (req, res) => {
    try {
      await verifyAgent(req);
      await ensureAgentSchema();
      const bundle = await latestBundle(false);
      if (!bundle) return res.status(404).json({ error: 'Nenhuma versão de clientes publicada ainda' });
      const file = path.join(bundleDir, bundle.file_name);
      if (!fs.existsSync(file)) return res.status(410).json({ error: 'Arquivo da versão sumiu do servidor; publique de novo' });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('X-Bundle-Version', String(bundle.version));
      res.setHeader('X-Bundle-Sha256', bundle.sha256);
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/clients-bundle/applied', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const version = Number(req.body?.version);
      if (!Number.isInteger(version) || version < 1) return res.status(400).json({ error: 'Versão inválida' });
      const machineId = await machineOfKey(agent.keyId);
      if (!machineId) return res.json({ ok: true, machine: null });
      await pool.query('UPDATE agent_machines SET clients_version = $2, clients_synced_at = now(), last_seen_at = now() WHERE id = $1', [machineId, version]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Botão "Sincronizar clientes": a chefe publica (Mac principal); os Macs desatualizados recebem o aviso para baixar
  app.post('/api/agent-machines/sync-clients', async (req, res) => {
    try {
      const user = await requireAdmin(req);
      const { rows: chiefs } = await pool.query(
        `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
          WHERE k.revoked_at IS NULL AND k.role = 'chefe'`
      );
      for (const c of chiefs) {
        await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [
          user.id, c.user_id,
          `Ordem do usuário (Configurações → Sincronizar clientes): rode \`pulse --agente ${agentSlug(c.name)} publicar-clientes\` para mandar mapa, agentes/ e pastas de clientes aos outros Macs.`,
        ]);
      }
      const bundle = await latestBundle(false);
      let outdated = [];
      if (bundle) {
        const { rows } = await pool.query(
          `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
             JOIN agent_machines m ON m.id = k.machine_id
            WHERE k.revoked_at IS NULL AND m.revoked_at IS NULL AND m.id IS DISTINCT FROM $1
              AND (m.clients_version IS NULL OR m.clients_version < $2)`,
          [bundle.machine_id, bundle.version]
        );
        for (const r of rows) {
          await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [
            user.id, r.user_id,
            `Ordem do usuário: seus clientes estão desatualizados (versão ${bundle.version} no sistema). Rode \`pulse --agente ${agentSlug(r.name)} baixar-clientes\` e aplique com --aplicar.`,
          ]);
        }
        outdated = rows.map((r) => r.name.trim());
      }
      res.json({ ok: true, publish_requested: chiefs.map((c) => c.name.trim()), download_requested: outdated });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent-machines/:id/pair', async (req, res) => {
    try {
      await requireAdmin(req);
      const { rows } = await pool.query(
        `SELECT m.id, m.name, m.hostname, m.pair_status, m.pair_report, m.pair_updated_at, m.connected_at,
                (SELECT max(c.expires_at) FROM agent_pair_codes c WHERE c.machine_id = m.id AND c.used_at IS NULL) AS code_expires_at
           FROM agent_machines m WHERE m.id = $1 AND m.revoked_at IS NULL`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Computador não encontrado' });
      const m = rows[0];
      // código vencido sem o Mac ter respondido
      const expired = m.pair_status === 'aguardando' && (!m.code_expires_at || new Date(m.code_expires_at) < new Date());
      // chaves entregues mas o Mac não terminou em 3 min: provavelmente parou no meio
      const stalled = ['chaves_entregues', 'chaves_gravadas'].includes(m.pair_status)
        && m.pair_updated_at && Date.now() - new Date(m.pair_updated_at).getTime() > 3 * 60_000;
      res.json({ ...m, pair_status: expired ? 'vencido' : stalled ? 'parado' : m.pair_status });
    } catch (error) {
      sendError(res, error);
    }
  });

  const PAIR_STAGES = new Set(['chaves_gravadas', 'verificando']);
  app.post('/api/agent/machine/report', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const { rows: keyRows } = await pool.query('SELECT machine_id FROM agent_keys WHERE id = $1', [agent.keyId]);
      const machineId = keyRows[0]?.machine_id;
      if (!machineId) return res.status(400).json({ error: 'Esta chave não pertence a um computador conectado' });
      const checks = (Array.isArray(req.body?.checks) ? req.body.checks : []).slice(0, 40).map((c) => ({
        label: String(c?.label || '').slice(0, 120),
        ok: !!c?.ok,
        detail: c?.detail ? String(c.detail).slice(0, 300) : null,
      }));
      let status;
      if (req.body?.done) status = checks.every((c) => c.ok) ? 'conectado' : 'com_avisos';
      else {
        status = String(req.body?.stage || '');
        if (!PAIR_STAGES.has(status)) return res.status(400).json({ error: 'Etapa inválida' });
      }
      await pool.query(
        `UPDATE agent_machines SET pair_status = $2, pair_report = $3::jsonb, pair_updated_at = now(), last_seen_at = now()
          WHERE id = $1 AND revoked_at IS NULL`,
        [machineId, status, JSON.stringify({ checks, node: req.body?.node || null })]
      );
      res.json({ ok: true, status });
    } catch (error) {
      sendError(res, error);
    }
  });

  // O Mac troca o código pelas chaves (o pulse.mjs grava cada uma em ~/.config/pulse/agentes/<nome>.key).
  app.post('/api/agent-pair', async (req, res) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const fail = pairFailures.get(ip);
    if (fail && fail.until > Date.now() && fail.count >= 10) {
      return res.status(429).json({ error: 'Muitas tentativas. Espere 15 minutos.' });
    }
    const registerFailure = () => {
      const cur = pairFailures.get(ip);
      const active = cur && cur.until > Date.now();
      pairFailures.set(ip, { count: active ? cur.count + 1 : 1, until: active ? cur.until : Date.now() + 15 * 60_000 });
    };
    // O esquema usa outra conexão do pool: garante antes de segurar a da transação
    try {
      await ensureAgentSchema();
    } catch (error) {
      return sendError(res, error);
    }
    const client = await pool.connect();
    try {
      const code = normalizePairCode(req.body?.code);
      const hostname = String(req.body?.hostname || '').trim().slice(0, 120) || null;
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE agent_pair_codes SET used_at = now()
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING machine_id, user_ids, created_by`,
        [hashKey(code)]
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        registerFailure();
        return res.status(400).json({ error: 'Código inválido, já usado ou vencido. Gere outro em Configurações → Agentes de IA → Computadores dos agentes.' });
      }
      const { machine_id: machineId, user_ids: userIds, created_by: createdBy } = rows[0];
      const { rows: machineRows } = await client.query(
        `UPDATE agent_machines SET hostname = $2, connected_at = now(), last_seen_at = now(),
                pair_status = 'chaves_entregues', pair_report = NULL, pair_updated_at = now()
          WHERE id = $1 AND revoked_at IS NULL RETURNING id, name`,
        [machineId, hostname]
      );
      if (!machineRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Este computador foi desconectado no sistema.' });
      }
      const agents = [];
      for (const userId of userIds) {
        const { rows: current } = await client.query(
          `SELECT k.role, p.name FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
            WHERE k.user_id = $1 ORDER BY k.created_at DESC LIMIT 1`,
          [userId]
        );
        if (!current.length) continue;
        // o agente passa a rodar só neste Mac
        await client.query('UPDATE agent_keys SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
        const raw = `pa_${crypto.randomBytes(32).toString('base64url')}`;
        await client.query(
          `INSERT INTO agent_keys (user_id, role, key_hash, key_hint, created_by, machine_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, current[0].role, hashKey(raw), raw.slice(-4), createdBy, machineId]
        );
        agents.push({ name: current[0].name, slug: agentSlug(current[0].name), role: current[0].role, key: raw });
      }
      await client.query('COMMIT');
      pairFailures.delete(ip);
      res.json({ machine: machineRows[0], agents });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      sendError(res, error);
    } finally {
      client.release();
    }
  });

  // ── Painel de agentes no sistema (admin) ──────────────────
  app.get('/api/agents/overview', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const [{ rows: agents }, { rows: pauses }, { rows: activityNow }, { rows: current }, { rows: delivered }, { rows: queue }, { rows: activity }] = await Promise.all([
        pool.query(
          `SELECT k.user_id, p.name, p.email, p.avatar_url,
                  string_agg(DISTINCT k.role, ',') AS roles,
                  MAX(k.last_used_at) AS last_used_at
             FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
            WHERE k.revoked_at IS NULL
            GROUP BY k.user_id, p.name, p.email, p.avatar_url
            ORDER BY p.name`
        ),
        pool.query(`SELECT scope, paused_at, reason, paused_by FROM agent_pauses`),
        pool.query(`SELECT user_id, status, updated_at FROM agent_activity WHERE updated_at > now() - interval '15 minutes'`),
        pool.query(
          `SELECT t.id, t.title, t.kanban_column, t.assigned_to, t.agent_step, t.agent_heartbeat_at, t.editing_started_at,
                  c.company_name AS client_name
             FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
            WHERE t.kanban_column IN ('edicao', 'alteracao')
              AND t.assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)`
        ),
        pool.query(
          `SELECT created_by,
                  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS today,
                  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS week,
                  COUNT(*) FILTER (WHERE version > 1 AND created_at >= now() - interval '7 days') AS week_alterations
             FROM edit_versions GROUP BY created_by`
        ),
        pool.query(
          `SELECT
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL AND pinned_at IS NULL) AS waiting,
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL AND pinned_at IS NULL AND COALESCE(drive_link, '') = '') AS without_footage,
              COUNT(*) FILTER (WHERE kanban_column = 'alteracao' AND edited_by IN (SELECT user_id FROM agent_keys)) AS agent_alterations,
              COUNT(*) FILTER (WHERE kanban_column = 'edicao' AND assigned_to IS NULL AND pinned_at IS NULL AND editing_deadline < now()) AS overdue
             FROM content_tasks
            WHERE content_type IS DISTINCT FROM 'otimizacao'`
        ),
        pool.query(
          `SELECT h.created_at, h.action, h.details, h.user_id, p.name AS agent_name, t.title, t.id AS task_id
             FROM task_history h
             JOIN profiles p ON p.id = h.user_id
             LEFT JOIN content_tasks t ON t.id = h.task_id
            WHERE h.user_id IN (SELECT user_id FROM agent_keys)
            ORDER BY h.created_at DESC
            LIMIT 20`
        ),
      ]);
      const allPause = pauses.find((p) => p.scope === 'all') || null;
      res.json({
        paused_all: allPause,
        queue: queue[0],
        agents: agents.map((a) => {
          const d = delivered.find((x) => x.created_by === a.user_id) || {};
          return {
            ...a,
            paused: pauses.find((p) => p.scope === String(a.user_id)) || null,
            status: activityNow.find((x) => String(x.user_id) === String(a.user_id)) || null,
            current: current.filter((t) => t.assigned_to === a.user_id),
            delivered_today: Number(d.today || 0),
            delivered_week: Number(d.week || 0),
            alterations_week: Number(d.week_alterations || 0),
          };
        }),
        activity,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Escritório Virtual: toda a equipe vê o agente online só enquanto executa uma tarefa.
  // A equipe foi avisada pelo usuário em 22/10/2026.
  app.get('/api/agents/office', async (req, res) => {
    try {
      await verifyUser(req);
      await ensureAgentSchema();
      const { rows: ids } = await pool.query(
        `SELECT user_id, string_agg(DISTINCT role, ',') AS roles FROM agent_keys WHERE revoked_at IS NULL GROUP BY user_id`
      );
      const agentIds = ids.map((r) => String(r.user_id));
      const { rows } = await pool.query(
        `SELECT t.assigned_to AS user_id, t.kanban_column, t.agent_step, t.title
           FROM content_tasks t
          WHERE t.assigned_to = ANY($1::uuid[])
            AND t.kanban_column IN ('edicao', 'alteracao')
            AND t.agent_heartbeat_at > now() - interval '30 minutes'`,
        [agentIds]
      );
      const { rows: activity } = await pool.query(
        `SELECT user_id, status FROM agent_activity WHERE updated_at > now() - interval '15 minutes'`
      );
      res.json({
        hidden: [],
        agents: agentIds.map((id) => {
          const task = rows.find((r) => String(r.user_id) === id);
          const act = activity.find((a) => String(a.user_id) === id);
          return {
            user_id: id,
            roles: ids.find((r) => String(r.user_id) === id)?.roles || 'editor',
            working: !!task || !!act,
            column: task?.kanban_column || null,
            step: task?.agent_step || act?.status || null,
            title: task?.title || null,
          };
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Foto do agente (admin): só para membros que têm chave de agente; a imagem já foi enviada por /api/upload
  app.post('/api/agents/:userId/avatar', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const url = String(req.body?.avatar_url || '');
      if (!/^https:\/\/agenciapulse\.tech\/uploads\/[\w./-]+\.(png|jpe?g|webp)$/i.test(url)) {
        return res.status(400).json({ error: 'Envie uma imagem PNG, JPG ou WEBP pelo upload do sistema' });
      }
      const { rowCount } = await pool.query(
        `UPDATE profiles SET avatar_url = $2, updated_at = now()
          WHERE id = $1 AND id IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)`,
        [req.params.userId, url]
      );
      if (!rowCount) return res.status(404).json({ error: 'Agente não encontrado' });
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agents/pause', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      const scope = String(req.body?.scope || 'all');
      const reason = String(req.body?.reason || '').slice(0, 300) || null;
      await pool.query(
        `INSERT INTO agent_pauses (scope, paused_by, reason) VALUES ($1, $2, $3)
         ON CONFLICT (scope) DO UPDATE SET paused_by = EXCLUDED.paused_by, reason = EXCLUDED.reason, paused_at = now()`,
        [scope, user.id, reason]
      );
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agents/resume', async (req, res) => {
    try {
      const { user } = await verifyUser(req);
      if (!(await isStrictAdmin(user))) return res.status(403).json({ error: 'Apenas administradores' });
      await ensureAgentSchema();
      await pool.query('DELETE FROM agent_pauses WHERE scope = $1', [String(req.body?.scope || 'all')]);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Rotas do agente ───────────────────────────────────────
  app.get('/api/agent/me', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      res.json({ id: agent.userId, name: agent.name, email: agent.email, role: agent.role, pause: await pauseStateFor(agent.userId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Sinal de vida geral: { status: "texto" } = trabalhando; { status: null } ou { done: true } = encerrou
  app.post('/api/agent/status', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (req.body?.done) {
        await pool.query('DELETE FROM agent_activity WHERE user_id = $1', [agent.userId]);
      } else {
        const status = String(req.body?.status || '').slice(0, 160) || null;
        await pool.query(
          `INSERT INTO agent_activity (user_id, status, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
          [agent.userId, status]
        );
      }
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Recados: { to: "<nome do agente>" | "todos", body }. Destinatários = membros com chave ativa.
  app.post('/api/agent/messages', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const to = String(req.body?.to || '').trim();
      const body = String(req.body?.body || '').trim().slice(0, 4000);
      if (!to || !body) return res.status(400).json({ error: 'Informe o destinatário e o recado' });
      const { rows: agents } = await pool.query(
        `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id WHERE k.revoked_at IS NULL`
      );
      const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const targets = to.toLowerCase() === 'todos'
        ? agents.filter((a) => a.user_id !== agent.userId)
        : agents.filter((a) => norm(a.name) === norm(to) || norm(a.name).split(/\s+/)[0] === norm(to));
      if (!targets.length) return res.status(404).json({ error: `Nenhum agente chamado "${to}"` });
      for (const t of targets) {
        await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [agent.userId, t.user_id, body]);
      }
      res.json({ ok: true, sent_to: targets.map((t) => t.name.trim()) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Caixa de entrada: devolve os não lidos e marca como lidos
  app.get('/api/agent/messages', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const { rows } = await pool.query(
        `UPDATE agent_messages m SET read_at = now()
           FROM (SELECT id FROM agent_messages WHERE to_user = $1 AND read_at IS NULL ORDER BY created_at LIMIT 50) x
          WHERE m.id = x.id
          RETURNING m.id, m.body, m.created_at,
                    (SELECT name FROM profiles WHERE id = m.from_user) AS from_name`,
        [agent.userId]
      );
      rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      res.json({ messages: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  const TASK_FIELDS = `
    t.id, t.title, t.kanban_column, t.content_type, t.client_id, t.drive_link, t.description,
    t.adjustment_notes, t.script_alteration_notes, t.immediate_alteration, t.editing_priority, t.urgent_at, t.waiting_material_at, t.waiting_material_note,
    t.editing_deadline, t.alteration_deadline, t.assigned_to, t.edited_by, t.edited_video_link,
    t.editing_started_at, t.agent_step, t.agent_heartbeat_at, t.position, t.created_at,
    t.script_id, t.script_alteration_type,
    t.agent_review_verdict, t.agent_review_notes, t.agent_review_at, t.pinned_at,
    c.company_name AS client_name, c.niche AS client_niche, c.drive_link AS client_drive_link,
    c.drive_identidade_visual AS client_identity_link,
    s.title AS script_title, s.content AS script_content, s.video_type AS script_video_type,
    (SELECT COALESCE(MAX(v.version), 0) FROM edit_versions v WHERE v.task_id = t.id) AS last_version`;

  // ── Prontidão do card para um agente pegar ──
  // Mesmas regras de src/lib/agentCardStatus.ts (agentReadiness), que mostra o selo "Pronto p/ IA"
  // no Kanban: brutos (drive_link) e cliente são obrigatórios (o `pulse pegar` recusa sem eles), o
  // tipo precisa ser editável por agente e a alteração precisa do texto do ajuste; roteiro
  // (reels/criativo) e prazo são recomendados. Mude os dois lados juntos.
  const AGENT_EDITABLE_TYPES = new Set(['reels', 'story', 'criativo']);
  function agentReadiness(t) {
    const missing = [];
    const type = t.content_type || '';
    if (t.pinned_at) missing.push({ key: 'fixado', label: 'desfixar (reservado para a equipe presencial)', blocking: true });
    if (!String(t.drive_link || '').trim()) missing.push({ key: 'brutos', label: 'link dos brutos (Drive)', blocking: true });
    if (!t.client_id) missing.push({ key: 'cliente', label: 'cliente cadastrado', blocking: true });
    if (!AGENT_EDITABLE_TYPES.has(type)) {
      missing.push({ key: 'tipo', label: type ? `tipo (${type} não é editado por agente)` : 'tipo do conteúdo', blocking: true });
    }
    if (t.kanban_column === 'alteracao' && !String(t.adjustment_notes || '').trim()) {
      missing.push({ key: 'ajustes', label: 'o que mudar (ajustes)', blocking: true });
    }
    if ((type === 'reels' || type === 'criativo') && !t.script_id) missing.push({ key: 'roteiro', label: 'roteiro', blocking: false });
    const hasDeadline = t.kanban_column === 'alteracao' ? !!t.alteration_deadline || !!t.immediate_alteration : !!t.editing_deadline;
    if (!hasDeadline) missing.push({ key: 'prazo', label: 'prazo', blocking: false });
    return { ready: missing.length === 0, blocked: missing.some((m) => m.blocking), missing };
  }

  // Histórico de ajustes do card: pedidos da equipe, da chefe e do cliente e os pareceres da Análise
  // (task_history). O adjustment_notes do card guarda só o último pedido.
  async function loadAdjustments(taskId, currentNotes) {
    const { rows } = await pool.query(
      `SELECT h.created_at, h.action, h.details, p.name AS by_name
         FROM task_history h LEFT JOIN profiles p ON p.id = h.user_id
        WHERE h.task_id = $1 AND COALESCE(h.details, '') <> ''
          AND (h.action = 'Solicitado Alteração' OR h.action ILIKE '%ajuste solicitado%' OR h.action = 'Parecer da Análise')
        ORDER BY h.created_at ASC`,
      [taskId]
    );
    const list = rows.map((r) => ({ at: r.created_at, by: r.by_name ? r.by_name.trim() : null, origin: r.action, notes: r.details }));
    const current = String(currentNotes || '').trim();
    if (current && !list.some((a) => String(a.notes).includes(current))) {
      list.push({ at: null, by: null, origin: 'Ajuste atual do card', notes: current });
    }
    return list;
  }

  app.get('/api/agent/queue', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      // agente de design não edita vídeo: a fila dele é a de artes (pulse arte fila); a triagem só cria cards
      if (NO_VIDEO_ROLES.has(agent.role)) {
        return res.json({ agent: { id: agent.userId, name: agent.name, role: agent.role }, pause: await pauseStateFor(agent.userId), tasks: [] });
      }
      const { rows } = await pool.query(
        `SELECT ${TASK_FIELDS}
           FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN scripts s ON s.id = t.script_id
          WHERE t.content_type IS DISTINCT FROM 'otimizacao'
            -- fixado: reservado para a equipe presencial até alguém desfixar
            AND t.pinned_at IS NULL
            AND (
              (t.kanban_column = 'edicao' AND (t.assigned_to IS NULL OR t.assigned_to = $1))
              -- alteração só de vídeo que o próprio agente editou (os de humanos não têm plano no OPEN CUT)
              OR (t.kanban_column = 'alteracao' AND t.edited_by = $1
                  AND (t.assigned_to IS NULL OR t.assigned_to = $1))
            )
          ORDER BY (t.waiting_material_at IS NULL) DESC,
                   (t.urgent_at IS NOT NULL) DESC,
                   (t.kanban_column = 'alteracao') DESC,
                   t.immediate_alteration DESC NULLS LAST,
                   t.editing_priority DESC NULLS LAST,
                   COALESCE(t.alteration_deadline, t.editing_deadline) ASC NULLS LAST,
                   t.position ASC NULLS LAST,
                   t.created_at ASC`,
        [agent.userId]
      );
      // readiness: o que falta para pegar (o mesmo selo "Pronto p/ IA" do Kanban)
      res.json({
        agent: { id: agent.userId, name: agent.name, role: agent.role },
        pause: await pauseStateFor(agent.userId),
        tasks: rows.map((t) => ({ ...t, readiness: agentReadiness(t) })),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/claim', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (DESIGN_ONLY_ROLES.has(agent.role)) return res.status(403).json({ error: 'Agente de design não pega vídeo: use pulse arte fila / pulse arte pegar' });
      if (NO_VIDEO_ROLES.has(agent.role)) {
        return res.status(403).json({ error: SUPPORT_ROLES.has(agent.role)
          ? 'Cor e som não pegam card: trabalham no projeto que o editor passa por recado (pulse etapa <card> mostra o que está fazendo)'
          : agent.role === 'roteirista'
            ? 'A roteirista não pega vídeo: escreve roteiros no módulo Copy (pulse treino para os ensinamentos)'
            : 'A triagem não pega vídeo: só cria cards (pulse triagem card-edicao / card-arte)' });
      }
      const pause = await pauseStateFor(agent.userId);
      if (pause.paused) {
        return res.status(423).json({ error: `Agentes pausados pelo sistema${pause.all ? '' : ` (${agent.name})`}. Não pegue cards novos.`, pause });
      }
      const { rows } = await pool.query(
        `UPDATE content_tasks SET
            assigned_to = $2,
            edited_by = $2,
            -- card livre começa o timer agora (o valor antigo podia vir de quando o card só entrou na fila)
            editing_started_at = CASE WHEN kanban_column = 'alteracao' OR assigned_to IS NULL OR editing_started_at IS NULL THEN now() ELSE editing_started_at END,
            editing_paused_at = NULL,
            agent_step = 'iniciado',
            agent_heartbeat_at = now(),
            updated_at = now()
          WHERE id = $1
            AND content_type IS DISTINCT FROM 'otimizacao'
            AND pinned_at IS NULL
            AND (assigned_to IS NULL OR assigned_to = $2)
            AND (
              kanban_column = 'edicao'
              OR (kanban_column = 'alteracao' AND edited_by = $2)
            )
          RETURNING id, kanban_column`,
        [req.params.id, agent.userId]
      );
      if (!rows.length) return res.status(409).json({ error: 'Card indisponível (já assumido, fixado para a equipe presencial, fora da fila ou de outro editor)' });
      await logHistory(rows[0].id, agent.userId, rows[0].kanban_column === 'alteracao' ? 'Alteração iniciada' : 'Edição iniciada');
      const { rows: full } = await pool.query(
        `SELECT ${TASK_FIELDS} FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN scripts s ON s.id = t.script_id
          WHERE t.id = $1`,
        [rows[0].id]
      );
      // Na alteração o agente precisa de todos os pedidos, não só o último
      res.json({ task: { ...full[0], adjustments: await loadAdjustments(full[0].id, full[0].adjustment_notes) } });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/heartbeat', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const step = String(req.body?.step || '').slice(0, 120) || null;
      const { rowCount } = await pool.query(
        `UPDATE content_tasks SET agent_step = COALESCE($3, agent_step), agent_heartbeat_at = now(), agent_step_by = $2
          WHERE id = $1 AND assigned_to = $2`,
        [req.params.id, agent.userId, step]
      );
      if (rowCount) return res.json({ ok: true });
      // etapa ao vivo de quem não é o dono do card (pedido do usuário, 31/10/2026: "nos cards do sistema mostre o
      // que está sendo feito em cada um em tempo real"): a revisão conferindo na Análise, a chefe, ou um editor
      // num card de outro agente. Só no fluxo de edição e nunca num card que está com uma pessoa da equipe.
      if (step && ['editor', 'revisor', 'chefe', 'colorista', 'som'].includes(agent.role)) {
        const r = await pool.query(
          `UPDATE content_tasks SET agent_step = $3, agent_heartbeat_at = now(), agent_step_by = $2
            WHERE id = $1 AND kanban_column IN ('edicao', 'alteracao', 'pre_revisao')
              AND (assigned_to IS NULL OR assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL))`,
          [req.params.id, agent.userId, step]
        );
        if (r.rowCount) return res.json({ ok: true });
      }
      res.status(409).json({ error: 'Este card não está com você' });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ⏸ Aguardando material: o editor do card, a revisão ou a chefe marcam (waiting: true + motivo) e desmarcam
  app.post('/api/agent/tasks/:id/waiting', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (!['editor', 'revisor', 'chefe'].includes(agent.role)) return res.status(403).json({ error: 'Só editor, revisão ou chefe' });
      const waiting = req.body?.waiting !== false;
      const note = String(req.body?.note || '').trim().slice(0, 500);
      if (waiting && !note) return res.status(400).json({ error: 'Diga o que falta (ex.: "projeto está no Mac")' });
      const { rows } = await pool.query(
        `SELECT id, title, kanban_column, assigned_to, edited_by FROM content_tasks WHERE id::text = $1 OR id::text LIKE $1 || '%' LIMIT 2`,
        [String(req.params.id).trim()]
      );
      if (rows.length !== 1) return res.status(rows.length ? 400 : 404).json({ error: rows.length ? 'Mais de um card com esse começo de id' : 'Card não encontrado' });
      const task = rows[0];
      if (!['edicao', 'alteracao'].includes(task.kanban_column)) return res.status(409).json({ error: 'Só card em Edição ou Alteração' });
      if (agent.role === 'editor' && ![task.assigned_to, task.edited_by].includes(agent.userId)) {
        return res.status(403).json({ error: 'Este card não é seu' });
      }
      await pool.query(
        `UPDATE content_tasks SET waiting_material_at = $2, waiting_material_note = $3, updated_at = now() WHERE id = $1`,
        [task.id, waiting ? new Date() : null, waiting ? note : null]
      );
      await logHistory(task.id, agent.userId, waiting ? '⏸ Aguardando material' : '▶ Material chegou, card retomado', note || null);
      res.json({ ok: true, task: { id: task.id, title: task.title }, waiting });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/agent/tasks/:id/release', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const reason = String(req.body?.reason || '').slice(0, 500) || null;
      const isChefe = agent.role === 'chefe';
      const { rows } = await pool.query(
        `UPDATE content_tasks SET
            assigned_to = NULL,
            editing_started_at = CASE WHEN kanban_column = 'edicao' THEN NULL ELSE editing_started_at END,
            edited_by = CASE WHEN kanban_column = 'edicao' THEN NULL ELSE edited_by END,
            agent_step = NULL,
            agent_heartbeat_at = NULL,
            updated_at = now()
          WHERE id = $1 AND kanban_column IN ('edicao', 'alteracao')
            AND (assigned_to = $2 OR ($3 AND assigned_to IN (SELECT user_id FROM agent_keys WHERE revoked_at IS NULL)))
          RETURNING id`,
        [req.params.id, agent.userId, isChefe]
      );
      if (!rows.length) return res.status(409).json({ error: 'Nada a liberar' });
      await logHistory(rows[0].id, agent.userId, 'Card devolvido para a fila', reason);
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Dados dos clientes para montar a estrutura no OPEN CUT (nicho, linha editorial, Drive, identidade)
  app.get('/api/agent/clients', async (req, res) => {
    try {
      await verifyAgent(req);
      const search = String(req.query.search || '').trim();
      const { rows } = await pool.query(
        `SELECT id, company_name, niche, city, editorial, color, logo_url,
                drive_link, drive_fotos, drive_identidade_visual
           FROM clients
          WHERE ($1 = '' OR company_name ILIKE '%' || $1 || '%')
          ORDER BY company_name`,
        [search]
      );
      res.json({ clients: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Organização (chefe): buscar e mover cards do fluxo de edição ──
  const MOVABLE = new Set(['edicao', 'revisao', 'alteracao']);

  // Tradução da alteração (pedido do dono em 30/10/2026): o revisor lê o que a equipe escreveu e a versão anterior e
  // grava no card o que fazer com precisão. A tradução entra no começo dos ajustes, com o marcador, e o pedido original
  // fica embaixo (uma tradução nova troca a anterior e mantém o original); o gatilho do banco então avisa o editor.
  app.post('/api/agent/tasks/:id/translation', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (!['revisor', 'chefe'].includes(agent.role)) return res.status(403).json({ error: 'Só o revisor ou a chefe traduzem alterações' });
      const texto = String(req.body?.text || '').trim().slice(0, 3500);
      if (texto.length < 20) return res.status(400).json({ error: 'Escreva a tradução (o que fazer, onde em mm:ss, como)' });
      const { rows } = await pool.query(
        `UPDATE content_tasks
            SET adjustment_notes = $2 || $3 || coalesce(nullif(split_part(coalesce(adjustment_notes, ''), $3, 2), ''), adjustment_notes, ''),
                updated_at = now()
          WHERE id = $1 AND kanban_column = 'alteracao'
          RETURNING title`,
        [req.params.id, `${TRADUCAO_ALTERACAO} (${(agent.name || 'revisor').trim()}):\n${texto}`, ORIGINAL_ALTERACAO]
      );
      if (!rows.length) return res.status(409).json({ error: 'O card não está em Alteração' });
      await pool.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [req.params.id, agent.userId, 'alteracao_traduzida', texto.slice(0, 500)]).catch(() => {});
      res.json({ ok: true, title: rows[0].title });
    } catch (error) {
      sendError(res, error);
    }
  });

  // client_portal_contents.content_task_id (criada pelo server.mjs na subida): liga o conteúdo do
  // portal ao card. Só memoriza o "sim", porque a coluna pode surgir depois desta checagem.
  // db: dentro de uma transação, passe o client dela (não pega outra conexão do pool).
  let portalTaskLinkReady = false;
  async function hasPortalTaskLink(db = pool) {
    if (portalTaskLinkReady) return true;
    const { rowCount } = await db.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'client_portal_contents' AND column_name = 'content_task_id'`
    ).catch(() => ({ rowCount: 0 }));
    portalTaskLinkReady = rowCount > 0;
    return portalTaskLinkReady;
  }
  const SOCIAL_STATUS = { revisao: 'revisao', alteracao: 'ajuste' };
  const MOVE_ACTION = { edicao: 'Movido para Edição', revisao: 'Enviado para Revisão', alteracao: 'Solicitado Alteração' };
  const PORTAL_NOTIF = {
    edicao: ['✂️ Vídeo em edição', (t) => `"${t}" foi enviado para edição. Prazo previsto: 2 dias úteis.`, 'editing_started'],
    revisao: ['👁 Revisão interna', (t) => `"${t}" está em revisão interna de qualidade.`, 'internal_review'],
    alteracao: ['🔧 Ajuste em andamento', (t) => `"${t}" está recebendo ajustes solicitados.`, 'adjustment'],
  };

  app.get('/api/agent/tasks', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (!['chefe', 'revisor'].includes(agent.role)) return res.status(403).json({ error: 'Apenas a chefe e a revisão' });
      const search = String(req.query.search || '').trim();
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.kanban_column, t.content_type, t.assigned_to, t.edited_by, t.edited_video_link,
                t.adjustment_notes, t.drive_link, t.editing_deadline, t.review_deadline, t.alteration_deadline,
                t.updated_at, t.description, t.content_type, t.script_alteration_notes,
                t.script_alteration_type, t.immediate_alteration, t.editing_priority, t.agent_step, t.agent_heartbeat_at,
                t.agent_review_verdict, t.agent_review_notes, t.agent_review_at,
                c.drive_link AS client_drive_link, c.drive_identidade_visual AS client_identity_link,
                c.company_name AS client_name, pe.name AS edited_by_name, pa.name AS assigned_to_name,
                s.title AS script_title, s.content AS script_content,
                (SELECT COALESCE(MAX(v.version), 0) FROM edit_versions v WHERE v.task_id = t.id) AS last_version
           FROM content_tasks t
           LEFT JOIN scripts s ON s.id = t.script_id
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN profiles pe ON pe.id = t.edited_by
           LEFT JOIN profiles pa ON pa.id = t.assigned_to
          WHERE t.kanban_column IN ('edicao', 'pre_revisao', 'revisao', 'alteracao', 'envio', 'acompanhamento', 'arquivado')
            AND ($1 = '' OR t.title ILIKE '%' || $1 || '%' OR c.company_name ILIKE '%' || $1 || '%' OR t.id::text LIKE $1 || '%')
          ORDER BY t.updated_at DESC
          LIMIT 50`,
        [search]
      );
      res.json({ tasks: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Vídeos já POSTADOS (usuário, 01/11/2026: bruto e projeto só saem do PC depois que o card está postado; "finalizado
  // eu digo postado"). Postado = card em Arquivado (o "Postado" do Agendamentos, da Entregas Social e do detalhe do card
  // arquivam o card e põem a entrega em 'postado'). Qualquer agente lê.
  //   GET /api/agent/posted?client=<nome ou id>&days=60
  app.get('/api/agent/posted', async (req, res) => {
    try {
      await verifyAgent(req);
      const client = String(req.query.client || '').trim();
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 60));
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.content_type, c.company_name AS client_name, pe.name AS edited_by_name,
                COALESCE(d.posted_at::text, to_char(t.posting_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD'),
                         to_char(t.updated_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS posted_on,
                (SELECT COALESCE(NULLIF(p.display_name, ''), p.name) FROM task_history h JOIN profiles p ON p.id = h.user_id
                  WHERE h.task_id = t.id AND h.action ILIKE 'postad%' ORDER BY h.created_at DESC LIMIT 1) AS marked_by
           FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN profiles pe ON pe.id = t.edited_by
           LEFT JOIN LATERAL (SELECT posted_at FROM social_media_deliveries sd
                               WHERE sd.content_task_id = t.id AND sd.status = 'postado'
                               ORDER BY sd.updated_at DESC NULLS LAST LIMIT 1) d ON true
          WHERE t.kanban_column = 'arquivado'
            AND t.updated_at > now() - ($2::int * interval '1 day')
            AND ($1 = '' OR c.company_name ILIKE '%' || $1 || '%' OR t.client_id::text = $1)
          ORDER BY posted_on DESC, t.updated_at DESC
          LIMIT 200`,
        [client, days]
      );
      res.json({ posted: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Move um card do fluxo de edição (Edição, Revisão, Alteração) gravando o mesmo que src/lib/contentTaskSync.ts.
  // Usado pela chefe (rota abaixo) e pelo Assistente PULSE (ordem pelo WhatsApp). userId = quem fica no histórico.
  async function moveEditCard(taskId, column, { userId = null, reason = null, notes = null } = {}) {
    if (!MOVABLE.has(column)) {
      throw Object.assign(new Error('Coluna permitida: edicao, revisao ou alteracao (enviar ao cliente é decisão humana)'), { status: 400 });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT t.*, c.company_name AS client_name FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.id = $1 FOR UPDATE OF t`,
        [taskId]
      );
      const task = rows[0];
      if (!task) throw Object.assign(new Error('Card não encontrado'), { status: 404 });
      if (!['edicao', 'pre_revisao', 'revisao', 'alteracao', 'envio'].includes(task.kanban_column)) {
        throw Object.assign(new Error(`O card está em "${task.kanban_column}", fora do fluxo de edição`), { status: 409 });
      }
      if (task.kanban_column === column && notes == null) throw Object.assign(new Error('O card já está nessa coluna'), { status: 409 });
      if (column === 'revisao' && !task.edited_video_link) {
        throw Object.assign(new Error('Não dá para mandar para revisão sem vídeo editado no card'), { status: 409 });
      }
      // Para entrar em Edição só os brutos são obrigatórios (decisão do dono, 26/10/2026): o card
      // entra livre na fila (assigned_to = NULL logo abaixo), para humanos e agentes pegarem
      if (column === 'edicao' && task.kanban_column !== 'edicao' && !String(task.drive_link || '').trim()) {
        throw Object.assign(new Error('Para entrar em Edição o card precisa do link dos brutos (drive_link)'), { status: 409 });
      }
      if (column === 'alteracao' && !notes && !task.adjustment_notes) {
        throw Object.assign(new Error('Informe os ajustes pedidos (adjustment_notes) ao mandar para alteração'), { status: 400 });
      }

      const now = new Date();
      const { rows: settingsRows } = await client.query('SELECT * FROM company_settings LIMIT 1');
      const settings = settingsRows[0] || {};
      if (typeof settings.work_days === 'string') {
        try { settings.work_days = JSON.parse(settings.work_days); } catch { settings.work_days = null; }
      }
      const workDays = Array.isArray(settings.work_days) && settings.work_days.length
        ? settings.work_days : ['segunda', 'terca', 'quarta', 'quinta', 'sexta'];
      const deadline = (hoursKey, enabledKey, fallback) => ((settings[enabledKey] ?? true)
        ? addBusinessHours(now, settings[hoursKey] ?? fallback, workDays).toISOString() : null);

      // mesmos campos que src/lib/contentTaskSync.ts grava ao mover
      const set = {
        kanban_column: column, reviewing_by: null, reviewing_by_name: null, reviewing_at: null,
        editing_deadline: null, review_deadline: null, alteration_deadline: null, approval_deadline: null,
        agent_step: null, agent_heartbeat_at: null,
      };
      if (column === 'edicao') {
        // Volta para a fila sem dono: o timer só começa quando alguém pegar (claim/Iniciar).
        // Antes gravava now() e o card aparecia como "editando" na Bancada sem ninguém nele.
        set.editing_started_at = null;
        set.editing_paused_at = null;
        set.editing_paused_seconds = 0;
        set.editing_deadline = deadline('editing_deadline_hours', 'editing_deadline_enabled', 48);
        set.assigned_to = null;
      }
      if (column === 'revisao') {
        set.review_deadline = deadline('review_deadline_hours', 'review_deadline_enabled', 24);
        set.approval_sent_at = now.toISOString();
        set.assigned_to = null;
      }
      if (column === 'alteracao') {
        if (!task.immediate_alteration) set.alteration_deadline = deadline('alteration_deadline_hours', 'alteration_deadline_enabled', 24);
        set.editing_started_at = null;
        set.editing_paused_at = null;
        set.editing_paused_seconds = 0;
        set.assigned_to = null;
      }
      if (notes != null) set.adjustment_notes = notes;

      const keys = Object.keys(set);
      await client.query(
        `UPDATE content_tasks SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [task.id, ...keys.map((k) => set[k])]
      );

      if (task.client_id) {
        const social = SOCIAL_STATUS[column];
        if (social) {
          const { rowCount } = await client.query('UPDATE social_media_deliveries SET status = $2 WHERE content_task_id = $1', [task.id, social]);
          if (!rowCount) {
            await client.query(
              `INSERT INTO social_media_deliveries
                 (client_id, content_type, title, description, status, delivered_at, recording_id, script_id, created_by, content_task_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [task.client_id, task.content_type, task.title, task.description || null, social, brazilDateString(now),
                task.recording_id || null, task.script_id || null, userId, task.id]
            );
          }
        } else {
          await client.query('DELETE FROM social_media_deliveries WHERE content_task_id = $1', [task.id]);
        }
        if (column === 'revisao' && task.edited_video_link) {
          // Pelo vínculo com o card (conteúdo antigo, sem vínculo, pelo título), ignorando conteúdos
          // já fechados (aprovado/agendado/publicado), como o contentTaskSync — senão o vídeo novo
          // sobrescreveria o de um mês anterior com o mesmo título.
          const linked = await hasPortalTaskLink(client);
          const { rows: portalRows } = await client.query(
            linked
              ? `SELECT id FROM client_portal_contents WHERE client_id = $1
                   AND (content_task_id = $3 OR (content_task_id IS NULL AND title = $2))
                   AND status NOT IN ('aprovado', 'agendado', 'publicado')
                 ORDER BY (content_task_id IS NOT NULL) DESC, created_at DESC LIMIT 1`
              : `SELECT id FROM client_portal_contents WHERE client_id = $1 AND title = $2
                   AND status NOT IN ('aprovado', 'agendado', 'publicado') ORDER BY created_at DESC LIMIT 1`,
            linked ? [task.client_id, task.title, task.id] : [task.client_id, task.title]
          );
          if (portalRows.length) {
            await client.query(
              `UPDATE client_portal_contents SET file_url = $2, status = 'revisao_interna'${linked ? ', content_task_id = $3' : ''}, updated_at = now() WHERE id = $1`,
              linked ? [portalRows[0].id, task.edited_video_link, task.id] : [portalRows[0].id, task.edited_video_link]
            );
          } else {
            const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'numeric' }).format(now));
            const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric' }).format(now));
            await client.query(
              `INSERT INTO client_portal_contents (client_id, title, content_type, file_url, status, season_month, season_year, uploaded_by${linked ? ', content_task_id' : ''})
               VALUES ($1, $2, $3, $4, 'revisao_interna', $5, $6, $7${linked ? ', $8' : ''})`,
              [task.client_id, task.title, task.content_type, task.edited_video_link, month, year, task.edited_by || userId,
                ...(linked ? [task.id] : [])]
            );
          }
        }
        const [title, message, type] = PORTAL_NOTIF[column];
        await client.query('INSERT INTO client_portal_notifications (client_id, title, message, type) VALUES ($1, $2, $3, $4)',
          [task.client_id, title, message(task.title), type]);
      }
      if (column === 'revisao') {
        await client.query(`SELECT notify_role('social_media'::app_role, $1, $2, 'review', '/entregas-social')`,
          ['Vídeo para Revisão', `${task.title} (${task.client_name || ''}) está pronto para revisão`]);
      }
      if (column === 'alteracao' && task.edited_by) {
        const urgent = task.immediate_alteration ? '🚨 IMEDIATO: ' : '';
        await client.query(`SELECT notify_user($1, $2, $3, 'adjustment', '/edicao/kanban')`,
          [task.edited_by, `${urgent}Ajuste solicitado`, `"${task.title}" (${task.client_name || ''}) precisa de ajustes`]);
      }
      await client.query('INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
        [task.id, userId, MOVE_ACTION[column], [reason, notes ? `Ajustes: ${notes}` : null].filter(Boolean).join(' · ') || null]);
      await client.query('COMMIT');
      return { from: task.kanban_column, to: column, title: task.title, client_name: task.client_name || null };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  app.post('/api/agent/tasks/:id/move', async (req, res) => {
    // Autentica e valida ANTES de pegar a conexão da transação: o verifyAgent usa outra conexão
    // do mesmo pool, e 10 pedidos simultâneos (até com chave falsa) travavam a API inteira.
    let agent;
    let column;
    let reason;
    let notes;
    try {
      agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Apenas a chefe move cards' });
      column = String(req.body?.column || '');
      if (!MOVABLE.has(column)) {
        return res.status(400).json({ error: 'Coluna permitida: edicao, revisao ou alteracao (enviar ao cliente é decisão humana)' });
      }
      reason = String(req.body?.reason || '').slice(0, 500) || null;
      notes = req.body?.adjustment_notes != null ? String(req.body.adjustment_notes).slice(0, 4000) : null;
    } catch (error) {
      return sendError(res, error);
    }

    try {
      res.json({ ok: true, ...(await moveEditCard(req.params.id, column, { userId: agent.userId, reason, notes })) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Tipo cadastrado errado (ex.: pacote de stories como "reels") trava o entregar-stories: a chefe corrige
  const RETYPE_ALLOWED = new Set(['reels', 'story', 'criativo']);
  app.post('/api/agent/tasks/:id/type', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Só a chefe corrige o tipo do card' });
      const next = String(req.body?.content_type || '').trim();
      const reason = String(req.body?.reason || '').trim().slice(0, 300);
      if (!RETYPE_ALLOWED.has(next)) return res.status(400).json({ error: 'Tipo deve ser reels, story ou criativo' });
      if (!reason) return res.status(400).json({ error: 'Diga o motivo' });
      const { rows } = await pool.query(
        `SELECT id, title, content_type, kanban_column FROM content_tasks WHERE id::text = $1 OR id::text LIKE $1 || '%'`,
        [String(req.params.id).trim()]
      );
      if (rows.length !== 1) return res.status(rows.length ? 400 : 404).json({ error: rows.length ? 'Mais de um card com esse começo de id' : 'Card não encontrado' });
      const task = rows[0];
      if (!['edicao', 'alteracao'].includes(task.kanban_column)) {
        return res.status(400).json({ error: 'Só dá para corrigir o tipo de card em Para Editar ou Alteração' });
      }
      if (!RETYPE_ALLOWED.has(task.content_type)) return res.status(400).json({ error: `Card do tipo ${task.content_type} não pode ser trocado por aqui` });
      if (task.content_type === next) return res.json({ ok: true, unchanged: true, task });
      await pool.query('UPDATE content_tasks SET content_type = $2, updated_at = now() WHERE id = $1', [task.id, next])
        .catch(() => pool.query('UPDATE content_tasks SET content_type = $2 WHERE id = $1', [task.id, next]));
      await logHistory(task.id, agent.userId, 'Tipo do card corrigido', `${task.content_type} → ${next}: ${reason}`);
      res.json({ ok: true, task: { ...task, content_type: next }, from: task.content_type });
    } catch (error) {
      sendError(res, error);
    }
  });

  // A chefe passa um card parado para um agente editor (ex.: alteração de vídeo cujo editor não está mais nele).
  // Regra do usuário (25/10/2026): só tira de quem NÃO está ativo no card — humano sem movimento no card nas
  // últimas 24 h, ou agente sem sinal de vida há 30 min. Tudo fica no histórico e o editor anterior é avisado.
  const ACTIVE_HUMAN_HOURS = 24;
  app.post('/api/agent/tasks/:id/assign', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Só a chefe passa card de um editor para outro' });
      const reason = String(req.body?.reason || '').trim().slice(0, 300);
      const toName = String(req.body?.to || '').trim();
      if (!toName || !reason) return res.status(400).json({ error: 'Informe o agente (to) e o motivo' });
      const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const { rows: editors } = await pool.query(
        `SELECT DISTINCT k.user_id, p.name FROM agent_keys k JOIN profiles p ON p.id = k.user_id
          WHERE k.revoked_at IS NULL AND k.role = 'editor'`
      );
      const target = editors.find((e) => norm(e.name) === norm(toName) || norm(e.name).split(/\s+/)[0] === norm(toName));
      if (!target) return res.status(404).json({ error: `Nenhum agente editor ativo chamado "${toName}"` });

      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.kanban_column, t.assigned_to, t.edited_by, t.editing_started_at, t.agent_heartbeat_at,
                pa.name AS assigned_name, pe.name AS edited_name
           FROM content_tasks t
           LEFT JOIN profiles pa ON pa.id = t.assigned_to
           LEFT JOIN profiles pe ON pe.id = t.edited_by
          WHERE t.id::text = $1 OR t.id::text LIKE $1 || '%'`,
        [String(req.params.id).trim()]
      );
      if (rows.length !== 1) return res.status(rows.length ? 400 : 404).json({ error: rows.length ? 'Mais de um card com esse começo de id' : 'Card não encontrado' });
      const task = rows[0];
      if (!['edicao', 'alteracao'].includes(task.kanban_column)) {
        return res.status(400).json({ error: 'Só dá para passar card em Para Editar ou Alteração' });
      }
      const owner = task.assigned_to || task.edited_by;
      if (owner === target.user_id && (task.kanban_column !== 'alteracao' || task.edited_by === target.user_id)) {
        return res.json({ ok: true, unchanged: true, task: { id: task.id, title: task.title } });
      }
      if (owner) {
        const { rows: agentKeys } = await pool.query(
          'SELECT 1 FROM agent_keys WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1', [owner]
        );
        if (agentKeys.length) {
          const alive = task.assigned_to === owner && task.agent_heartbeat_at
            && Date.now() - new Date(task.agent_heartbeat_at).getTime() < 30 * 60_000;
          if (alive) return res.status(409).json({ error: `O card está com ${task.assigned_name || 'outro agente'} agora (sinal de vida há menos de 30 min)` });
        } else {
          const { rows: recent } = await pool.query(
            `SELECT 1 FROM task_history WHERE task_id = $1 AND user_id = $2 AND created_at > now() - ($3 || ' hours')::interval LIMIT 1`,
            [task.id, owner, String(ACTIVE_HUMAN_HOURS)]
          );
          const startedRecently = task.assigned_to === owner && task.editing_started_at
            && Date.now() - new Date(task.editing_started_at).getTime() < ACTIVE_HUMAN_HOURS * 3600_000;
          if (recent.length || startedRecently) {
            const name = (task.assigned_to === owner ? task.assigned_name : task.edited_name) || 'um editor';
            return res.status(409).json({ error: `${name.trim()} mexeu neste card nas últimas ${ACTIVE_HUMAN_HOURS} h: continua com ele` });
          }
        }
      }
      // alteração vai para a fila do agente pelo "editado por"; edição volta livre para ele pegar
      await pool.query(
        `UPDATE content_tasks SET edited_by = CASE WHEN kanban_column = 'alteracao' THEN $2 ELSE edited_by END,
                assigned_to = NULL, agent_step = NULL, agent_heartbeat_at = NULL, updated_at = now()
          WHERE id = $1`,
        [task.id, target.user_id]
      );
      const fromName = (task.assigned_name || task.edited_name || 'ninguém').trim();
      await logHistory(task.id, agent.userId, `Card passado para ${target.name.trim()}`, `de ${fromName} para ${target.name.trim()}: ${reason}`);
      if (owner && owner !== target.user_id) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'adjustment', '/edicao/kanban')`,
          [owner, 'Card passado para outro editor', `"${task.title}" foi passado para ${target.name.trim()}: ${reason}`]
        ).catch(() => {});
      }
      await pool.query('INSERT INTO agent_messages (from_user, to_user, body) VALUES ($1, $2, $3)', [
        agent.userId, target.user_id,
        `Card ${task.id.slice(0, 8)} "${task.title}" (${task.kanban_column === 'alteracao' ? 'alteração' : 'edição'}) agora é seu: ${reason}`,
      ]).catch(() => {});
      res.json({ ok: true, task: { id: task.id, title: task.title, column: task.kanban_column }, from: fromName, to: target.name.trim() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/agent/stale', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (agent.role !== 'chefe') return res.status(403).json({ error: 'Apenas a chefe' });
      const minutes = Math.max(5, Math.min(24 * 60, Number(req.query.minutes) || 30));
      const { rows } = await pool.query(
        `SELECT t.id, t.title, t.kanban_column, t.agent_step, t.agent_heartbeat_at, t.assigned_to, p.name AS agent_name
           FROM content_tasks t
           LEFT JOIN profiles p ON p.id = t.assigned_to
          WHERE t.kanban_column IN ('edicao', 'alteracao')
            AND EXISTS (SELECT 1 FROM agent_keys k WHERE k.user_id = t.assigned_to AND k.revoked_at IS NULL)
            AND (t.agent_heartbeat_at IS NULL OR t.agent_heartbeat_at < now() - ($1 || ' minutes')::interval)
          ORDER BY t.agent_heartbeat_at ASC NULLS FIRST`,
        [String(minutes)]
      );
      res.json({ minutes, tasks: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Parecer do revisor IA na Análise: fica no card (selo "✅/⚠ Parecer IA" no Kanban) e no histórico.
  // { verdict: 'ok' | 'ajustes', notes } — no 'ajustes', notes é obrigatório (mm:ss + o que mudar).
  // Não move o card: quem libera ou devolve continua sendo a chefe (`pulse mover`).
  app.post('/api/agent/tasks/:id/review', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      if (!['revisor', 'chefe'].includes(agent.role)) return res.status(403).json({ error: 'Só a revisão e a chefe dão parecer' });
      const verdict = String(req.body?.verdict || '').trim().toLowerCase();
      const notes = String(req.body?.notes || '').trim().slice(0, 4000);
      if (!['ok', 'ajustes'].includes(verdict)) return res.status(400).json({ error: 'verdict deve ser "ok" ou "ajustes"' });
      if (verdict === 'ajustes' && !notes) return res.status(400).json({ error: 'Diga o que mudar (notes), com o tempo do vídeo (mm:ss)' });
      const { rows } = await pool.query(
        `SELECT id, title, kanban_column FROM content_tasks WHERE id::text = $1 OR id::text LIKE $1 || '%' LIMIT 2`,
        [String(req.params.id).trim()]
      );
      if (rows.length !== 1) return res.status(rows.length ? 400 : 404).json({ error: rows.length ? 'Mais de um card com esse começo de id' : 'Card não encontrado' });
      const task = rows[0];
      if (!['pre_revisao', 'revisao'].includes(task.kanban_column)) {
        return res.status(409).json({ error: `O card está em "${task.kanban_column}": parecer só na Análise ou na Revisão` });
      }
      await pool.query(
        `UPDATE content_tasks SET agent_review_verdict = $2, agent_review_notes = $3, agent_review_by = $4, agent_review_at = now()
          WHERE id = $1`,
        [task.id, verdict, notes || null, agent.userId]
      );
      await logHistory(task.id, agent.userId, 'Parecer da Análise', `${verdict === 'ok' ? '✅ ok' : '⚠ ajustes'}${notes ? `: ${notes}` : ''}`);
      // ✅ na Análise libera para a Revisão na hora (pedido do usuário, 31/10/2026: a liberação dependia da chefe
      // e atrasava). ⚠ continua com a chefe, que devolve para Alteração com os ajustes.
      let released = false;
      if (verdict === 'ok' && task.kanban_column === 'pre_revisao') {
        try {
          await moveEditCard(task.id, 'revisao', { userId: agent.userId, reason: 'Parecer ✅ da Análise: liberado automaticamente' });
          released = true;
        } catch (error) {
          console.error('[agent] liberação automática falhou', task.id, error?.message || error);
        }
      }
      res.json({ ok: true, task: { id: task.id, title: task.title, column: released ? 'revisao' : task.kanban_column }, verdict, released });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Card completo (o `pulse ver` deveria usar esta rota): campos da fila, prontidão, parecer,
  // histórico de ajustes, versões entregues e as últimas movimentações. Editor: card livre na
  // Edição ou que é/foi dele; chefe e revisão: qualquer card. O id só aceita hexadecimal e hífen:
  // assim a rota não captura outros GET em /api/agent/tasks/<nome> que venham a ser criados.
  app.get('/api/agent/tasks/:id([0-9a-fA-F-]+)', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const id = String(req.params.id || '').trim();
      if (id.length < 6) return res.status(400).json({ error: 'Informe o id do card (pelo menos 6 caracteres)' });
      const { rows } = await pool.query(
        `SELECT ${TASK_FIELDS}, t.review_deadline, t.approval_deadline, t.updated_at, t.agent_review_by,
                pe.name AS edited_by_name, pa.name AS assigned_to_name, pr.name AS agent_review_by_name
           FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
           LEFT JOIN scripts s ON s.id = t.script_id
           LEFT JOIN profiles pe ON pe.id = t.edited_by
           LEFT JOIN profiles pa ON pa.id = t.assigned_to
           LEFT JOIN profiles pr ON pr.id = t.agent_review_by
          WHERE t.id::text = $1 OR t.id::text LIKE $1 || '%'
          LIMIT 2`,
        [id]
      );
      if (rows.length !== 1) return res.status(rows.length ? 400 : 404).json({ error: rows.length ? 'Mais de um card com esse começo de id' : 'Card não encontrado' });
      const task = rows[0];
      if (agent.role === 'editor') {
        const own = task.assigned_to === agent.userId || task.edited_by === agent.userId;
        const free = task.kanban_column === 'edicao' && !task.assigned_to;
        if (!own && !free) return res.status(403).json({ error: 'Card de outro editor' });
      }
      const [adjustments, { rows: versions }, { rows: history }] = await Promise.all([
        loadAdjustments(task.id, task.adjustment_notes),
        pool.query(
          `SELECT v.version, v.video_url, v.notes, v.created_at, (v.plan IS NOT NULL) AS has_plan, p.name AS by_name
             FROM edit_versions v LEFT JOIN profiles p ON p.id = v.created_by
            WHERE v.task_id = $1 ORDER BY v.version ASC`,
          [task.id]
        ),
        pool.query(
          `SELECT h.created_at, h.action, h.details, p.name AS by_name
             FROM task_history h LEFT JOIN profiles p ON p.id = h.user_id
            WHERE h.task_id = $1 ORDER BY h.created_at DESC LIMIT 30`,
          [task.id]
        ),
      ]);
      res.json({ task: { ...task, readiness: agentReadiness(task), adjustments, versions, history } });
    } catch (error) {
      sendError(res, error);
    }
  });

  // ── Entrega ───────────────────────────────────────────────
  // Extensão final decidida pelo servidor, nunca a do nome original: um "x.html" declarado como
  // video/mp4 passava no filtro e ia para /uploads como .html (rodando no domínio do sistema).
  function safeVideoExt(file) {
    const original = String(file.originalname || '').toLowerCase();
    return /\.mov$/.test(original) || file.mimetype === 'video/quicktime' ? '.mov' : '.mp4';
  }

  const deliverUpload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        try {
          fs.mkdirSync(req.agentUploadDir, { recursive: true });
          cb(null, req.agentUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename(_req, file, cb) {
        const ext = file.fieldname === 'plan' ? '.json' : safeVideoExt(file);
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 2 },
    fileFilter(_req, file, cb) {
      if (file.fieldname === 'video' && !/^video\//.test(file.mimetype) && !/\.(mp4|mov)$/i.test(file.originalname || '')) {
        return cb(Object.assign(new Error('O vídeo precisa ser MP4/MOV'), { status: 400 }));
      }
      cb(null, true);
    },
  }).fields([{ name: 'video', maxCount: 1 }, { name: 'plan', maxCount: 1 }]);

  function removeFiles(req) {
    for (const list of Object.values(req.files || {})) {
      for (const file of list) fs.promises.unlink(file.path).catch(() => {});
    }
  }

  app.post('/api/agent/tasks/:id/deliver', async (req, res) => {
    let agent;
    let task;
    try {
      agent = await verifyAgent(req);
      const { rows } = await pool.query(
        `SELECT t.*, c.company_name AS client_name FROM content_tasks t
           LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.id = $1`,
        [req.params.id]
      );
      task = rows[0];
      if (!task) return res.status(404).json({ error: 'Card não encontrado' });
      if (task.assigned_to !== agent.userId || !['edicao', 'alteracao'].includes(task.kanban_column)) {
        return res.status(409).json({ error: 'Assuma o card (claim) antes de entregar' });
      }
      const folder = path.join('content', task.client_id || 'avulso', task.id);
      req.agentUploadDir = path.resolve(uploadRoot, folder);
      if (!req.agentUploadDir.startsWith(path.resolve(uploadRoot))) return res.status(400).json({ error: 'Pasta inválida' });
    } catch (error) {
      return sendError(res, error);
    }

    deliverUpload(req, res, async (uploadError) => {
      if (uploadError) {
        removeFiles(req);
        const status = uploadError.status || (uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : uploadError.code === 'ENOSPC' ? 507 : 500);
        return res.status(status).json({ error: uploadError.message || 'Falha no upload' });
      }
      const video = req.files?.video?.[0];
      if (!video) {
        removeFiles(req);
        return res.status(400).json({ error: 'Envie o vídeo no campo "video"' });
      }

      let plan = null;
      const planFile = req.files?.plan?.[0];
      if (planFile) {
        try {
          plan = JSON.parse(await fs.promises.readFile(planFile.path, 'utf8'));
        } catch {
          removeFiles(req);
          return res.status(400).json({ error: 'plan não é um JSON válido' });
        }
        fs.promises.unlink(planFile.path).catch(() => {});
      }

      const relative = path.relative(path.resolve(uploadRoot), video.path).split(path.sep).join('/');
      const videoUrl = `${uploadsBase}/${relative}`;
      const notes = String(req.body?.notes || '').slice(0, 4000) || null;
      const now = new Date();

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Recheca dentro da transação: ninguém mexeu no card durante o upload
        const { rows: locked } = await client.query(
          `SELECT id FROM content_tasks WHERE id = $1 AND assigned_to = $2 AND kanban_column IN ('edicao', 'alteracao') FOR UPDATE`,
          [task.id, agent.userId]
        );
        if (!locked.length) throw Object.assign(new Error('O card mudou durante o envio; entrega cancelada'), { status: 409 });

        const { rows: versionRows } = await client.query(
          `INSERT INTO edit_versions (task_id, version, video_url, plan, notes, created_by)
           VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM edit_versions WHERE task_id = $1), $2, $3, $4, $5)
           RETURNING version`,
          [task.id, videoUrl, plan ? JSON.stringify(plan) : null, notes, agent.userId]
        );

        // Análise (coluna pre_revisao): o Uriel revisa e a Marcely libera para a revisão humana (pulse mover … revisao).
        // Aqui não há prazo, Social Media, portal nem aviso para a equipe — isso acontece ao entrar em "revisao".
        await client.query(
          `UPDATE content_tasks SET
              kanban_column = 'pre_revisao',
              edited_video_link = $2,
              edited_video_type = 'upload',
              edited_by = $3,
              assigned_to = NULL,
              reviewing_by = NULL, reviewing_by_name = NULL, reviewing_at = NULL,
              editing_deadline = NULL, alteration_deadline = NULL, approval_deadline = NULL, review_deadline = NULL,
              -- versão nova: o parecer anterior da Análise não vale mais
              agent_review_verdict = NULL, agent_review_notes = NULL, agent_review_by = NULL, agent_review_at = NULL,
              agent_step = 'pré-revisão',
              agent_heartbeat_at = now(),
              updated_at = now()
            WHERE id = $1`,
          [task.id, videoUrl, agent.userId]
        );
        await client.query(
          'INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)',
          [task.id, agent.userId, 'Vídeo editado enviado via upload', videoUrl,
            'Enviado para Análise', `Versão ${versionRows[0].version}${notes ? ` · ${notes}` : ''}`]
        );
        const reviewDeadline = null;

        await client.query('COMMIT');
        res.json({ ok: true, version: versionRows[0].version, video_url: videoUrl, review_deadline: reviewDeadline });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        fs.promises.unlink(video.path).catch(() => {});
        sendError(res, error);
      } finally {
        client.release();
      }
    });
  });

  // ── Pacote de stories: vários vídeos num card de story → um card por story (nome próprio no portal) ──
  // multipart: stories (vários arquivos, na ordem) + names (JSON com um nome por arquivo) + notes
  const storiesUpload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        try { fs.mkdirSync(req.agentUploadDir, { recursive: true }); cb(null, req.agentUploadDir); } catch (error) { cb(error); }
      },
      filename(_req, file, cb) {
        cb(null, `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeVideoExt(file)}`);
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 30 },
    fileFilter(_req, file, cb) {
      if (!/^video\//.test(file.mimetype) && !/\.(mp4|mov)$/i.test(file.originalname || '')) {
        return cb(Object.assign(new Error('Cada story precisa ser MP4/MOV'), { status: 400 }));
      }
      cb(null, true);
    },
  }).array('stories', 30);

  app.post('/api/agent/tasks/:id/deliver-stories', async (req, res) => {
    let agent;
    let task;
    try {
      agent = await verifyAgent(req);
      await ensureAgentSchema();
      const { rows } = await pool.query(
        `SELECT t.*, c.company_name AS client_name FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`,
        [req.params.id]
      );
      task = rows[0];
      if (!task) return res.status(404).json({ error: 'Card não encontrado' });
      if (task.assigned_to !== agent.userId || task.kanban_column !== 'edicao') {
        return res.status(409).json({ error: 'Assuma o card de story (claim) antes de entregar' });
      }
      if (task.content_type !== 'story') return res.status(400).json({ error: 'Só cards de story recebem vários vídeos' });
      req.agentUploadDir = path.resolve(uploadRoot, path.join('content', task.client_id || 'avulso', task.id, 'stories'));
      if (!req.agentUploadDir.startsWith(path.resolve(uploadRoot))) return res.status(400).json({ error: 'Pasta inválida' });
    } catch (error) {
      return sendError(res, error);
    }

    storiesUpload(req, res, async (uploadError) => {
      const files = req.files || [];
      const cleanup = () => files.forEach((f) => fs.promises.unlink(f.path).catch(() => {}));
      if (uploadError) {
        cleanup();
        const status = uploadError.status || (uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : uploadError.code === 'ENOSPC' ? 507 : 500);
        return res.status(status).json({ error: uploadError.message || 'Falha no upload' });
      }
      let names = [];
      try { names = JSON.parse(String(req.body?.names || '[]')); } catch { names = []; }
      names = Array.isArray(names) ? names.map((n) => String(n || '').trim().slice(0, 120)) : [];
      if (!files.length) { cleanup(); return res.status(400).json({ error: 'Envie os vídeos no campo "stories"' }); }
      if (names.length !== files.length || names.some((n) => !n)) {
        cleanup();
        return res.status(400).json({ error: 'Envie um nome para cada story (names, na mesma ordem dos vídeos)' });
      }
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
        cleanup();
        return res.status(400).json({ error: 'Cada story precisa de um nome diferente' });
      }
      const notes = String(req.body?.notes || '').slice(0, 4000) || null;
      // a coluna city só existe em alguns bancos (escopo por cidade); copia do card pai quando existir
      const { rowCount: hasCity } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'content_tasks' AND column_name = 'city'`
      );
      const { rowCount: historyHasCity } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'task_history' AND column_name = 'city'`
      );
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const { rows: locked } = await db.query(
          `SELECT id FROM content_tasks WHERE id = $1 AND assigned_to = $2 AND kanban_column = 'edicao' FOR UPDATE`,
          [task.id, agent.userId]
        );
        if (!locked.length) throw Object.assign(new Error('O card mudou durante o envio; entrega cancelada'), { status: 409 });

        // Os stories entram em 'pre_revisao', que de propósito não tem prazo (review_deadline NULL,
        // como no deliver simples): o prazo de revisão é gravado quando a chefe move para 'revisao'.
        const created = [];
        for (let i = 0; i < files.length; i++) {
          const rel = path.relative(path.resolve(uploadRoot), files[i].path).split(path.sep).join('/');
          const url = `${uploadsBase}/${rel}`;
          const title = `${task.title.trim()} · ${names[i]}`;
          const { rows: child } = await db.query(
            `INSERT INTO content_tasks
               (client_id, title, content_type, kanban_column, description, recording_id, script_id, drive_link,
                edited_video_link, edited_video_type, created_by, edited_by, assigned_to, position, parent_task_id,
                review_deadline, approval_sent_at${hasCity ? ', city' : ''}, created_at, updated_at)
             VALUES ($1, $2, 'story', 'pre_revisao', $3, $4, $5, $6, $7, 'upload', $8, $8, NULL, $9, $10, $11, $12${hasCity ? ', $13' : ''}, now(), now())
             RETURNING id`,
            [task.client_id, title, task.description || null, task.recording_id || null, task.script_id || null,
              task.drive_link || null, url, agent.userId, i, task.id, null, null,
              ...(hasCity ? [task.city || null] : [])]
          );
          const childId = child[0].id;
          // O histórico do pacote (gravação, quem pegou, alterações) passa para cada story:
          // o card original é apagado logo abaixo e o histórico dele ficava órfão.
          await db.query(
            `INSERT INTO task_history (task_id, user_id, action, details, created_at${historyHasCity ? ', city' : ''})
             SELECT $1, user_id, action, details, created_at${historyHasCity ? ', city' : ''} FROM task_history WHERE task_id = $2`,
            [childId, task.id]
          );
          await db.query(
            `INSERT INTO edit_versions (task_id, version, video_url, notes, created_by) VALUES ($1, 1, $2, $3, $4)`,
            [childId, url, notes, agent.userId]
          );
          await db.query(
            `INSERT INTO task_history (task_id, user_id, action, details) VALUES ($1, $2, 'Enviado para Análise', $3)`,
            [childId, agent.userId, `Story ${i + 1} de ${files.length} do card "${task.title.trim()}"${notes ? ` · ${notes}` : ''}`]
          );
          created.push({ id: childId, title, video_url: url });
        }

        await db.query('DELETE FROM social_media_deliveries WHERE content_task_id = $1', [task.id]);
        await db.query('DELETE FROM content_tasks WHERE id = $1', [task.id]);
        await db.query('COMMIT');
        res.json({ ok: true, stories: created, column: 'pre_revisao' });
      } catch (error) {
        await db.query('ROLLBACK').catch(() => {});
        cleanup();
        sendError(res, error);
      } finally {
        db.release();
      }
    });
  });

  // usado pelas rotas de design (agentDesignRoutes.mjs): mesma chave, pausa e esquema
  return { verifyAgent, pauseStateFor, ensureAgentSchema, agentSlug, moveEditCard };
}

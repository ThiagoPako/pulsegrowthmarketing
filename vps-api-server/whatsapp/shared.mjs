// WhatsApp próprio (Baileys) — partes usadas pela API (server.mjs) e pelo processo do WhatsApp (wa-server.mjs).
// Os dois só conversam pelo banco: a API grava pedidos (conexões, fila de envio) e lê o que chegou;
// o processo do WhatsApp mantém as conexões abertas, envia a fila e grava as mensagens recebidas.

// Funções que cada conexão pode assumir. Cada envio do sistema pertence a uma delas.
export const WA_PURPOSES = {
  aprovacao: 'Aprovação de vídeos e artes',
  agenda: 'Agenda de gravações (agendada, confirmação, cancelamento, reserva, feriado)',
  cobranca: 'Cobrança e financeiro',
  crm: 'CRM (lembrete de reunião com leads)',
  equipe: 'Equipe e parceiros (tarefas do dia)',
  clube: 'Clube de Descontos',
  geral: 'Mensagens avulsas e o que não tiver conexão própria',
};

// Envios antigos que não dizem a função: deduz pelo tipo do disparo
const TRIGGER_PURPOSE = {
  auto_confirmation: 'agenda',
  auto_recording: 'agenda',
  auto_reminder: 'agenda',
  auto_backup: 'agenda',
  auto_design_approved: 'aprovacao',
  auto_approval_expired: 'aprovacao',
  cobranca: 'cobranca',
  cobranca_lembrete: 'cobranca',
  endo_daily_tasks: 'equipe',
  crm_reminder: 'crm',
  clube_cupom: 'clube',
  clube_campanha: 'clube',
};

// grupo do WhatsApp: jid "…@g.us" ou link de convite "chat.whatsapp.com/…"
export const isGroupTarget = (to) => /@g\.us$/.test(String(to || '').trim()) || /chat\.whatsapp\.com\//i.test(String(to || ''));

/** Para onde vai a mensagem de um cliente: grupo dele (se tiver), exceto cobrança, que é sempre no privado. */
export function clientTarget(client, purpose) {
  if (!client) return null;
  if (purpose !== 'cobranca' && client.whatsapp_group && String(client.whatsapp_group).trim()) return String(client.whatsapp_group).trim();
  return client.whatsapp || null;
}

export function purposeFor(purpose, triggerType) {
  if (purpose && WA_PURPOSES[purpose]) return purpose;
  return TRIGGER_PURPOSE[triggerType] || 'geral';
}

let schemaReady = null;
export function ensureWhatsAppSchema(pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          purposes TEXT[] NOT NULL DEFAULT '{}',
          desired TEXT NOT NULL DEFAULT 'desligada',
          command TEXT,
          pair_phone TEXT,
          status TEXT NOT NULL DEFAULT 'nova',
          qr TEXT,
          qr_image TEXT,
          pairing_code TEXT,
          phone TEXT,
          push_name TEXT,
          last_error TEXT,
          connected_at TIMESTAMPTZ,
          last_seen_at TIMESTAMPTZ,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_auth (
          connection_id UUID NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (connection_id, key)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_outbox (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          purpose TEXT NOT NULL DEFAULT 'geral',
          connection_id UUID,
          to_number TEXT NOT NULL,
          jid TEXT,
          body TEXT,
          media_url TEXT,
          media_name TEXT,
          status TEXT NOT NULL DEFAULT 'fila',
          attempts INTEGER NOT NULL DEFAULT 0,
          error TEXT,
          wa_id TEXT,
          client_id UUID,
          trigger_type TEXT,
          sent_by UUID,
          log_id UUID,
          next_try_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          sent_at TIMESTAMPTZ
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_outbox_fila ON wa_outbox (status, next_try_at)`);
      // mensagem com hora marcada (confirmação de gravação, lembrete de reunião) não sai depois do compromisso
      await pool.query(`ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_inbound (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          connection_id UUID,
          wa_id TEXT,
          from_jid TEXT,
          phone TEXT,
          push_name TEXT,
          text TEXT,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          handled_at TIMESTAMPTZ,
          result TEXT
        )
      `);
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_inbound_msg ON wa_inbound (connection_id, wa_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_inbound_pendente ON wa_inbound (handled_at) WHERE handled_at IS NULL`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_jid_cache (
          number TEXT PRIMARY KEY,
          jid TEXT,
          on_whatsapp BOOLEAN NOT NULL,
          checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE TABLE IF NOT EXISTS wa_engine (id INTEGER PRIMARY KEY, seen_at TIMESTAMPTZ, version TEXT)`);
      // grupos em que cada número conectado está (para mandar no grupo do cliente pelo número que está nele)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_groups (
          connection_id UUID NOT NULL,
          jid TEXT NOT NULL,
          subject TEXT,
          size INTEGER,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (connection_id, jid)
        )
      `);
      await pool.query(`ALTER TABLE wa_inbound ADD COLUMN IF NOT EXISTS group_jid TEXT`);
      // dois números da agência no mesmo grupo recebem a mesma mensagem: guarda uma vez só
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_inbound_grupo ON wa_inbound (group_jid, wa_id) WHERE group_jid IS NOT NULL`);
      // vídeo mandado no privado (cliente não conseguiu abrir o portal): espera "APROVADO" ou o ajuste
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_approval_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          batch_id UUID NOT NULL,
          position INTEGER NOT NULL DEFAULT 1,
          client_id UUID NOT NULL,
          content_id UUID NOT NULL,
          title TEXT,
          phone TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendente',
          answer TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          answered_at TIMESTAMPTZ
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_approval_phone ON wa_approval_requests (phone, status)`);
      // texto que não deu para entender: a explicação de como responder vai uma vez só por lote
      await pool.query(`ALTER TABLE wa_approval_requests ADD COLUMN IF NOT EXISTS help_sent_at TIMESTAMPTZ`);
      // feriado "Anual": cada ocorrência avisa uma vez (o notification_sent antigo valia para a vida toda)
      await pool.query(`ALTER TABLE holidays ADD COLUMN IF NOT EXISTS last_notified_date DATE`).catch(() => {});
      // aviso "vídeo novo no portal": cada conteúdo avisa uma vez só
      await pool.query(`ALTER TABLE client_portal_contents ADD COLUMN IF NOT EXISTS wa_notified_at TIMESTAMPTZ`).catch(() => {});
      // versão corrigida: quando o conteúdo volta para "pendente" (ajuste feito), avisa de novo. Vale para toda origem
      // (telas, agentes, portal), por isso fica no banco. Só no UPDATE: o INSERT pode já vir marcado como avisado.
      await pool.query(`
        CREATE OR REPLACE FUNCTION public.reset_portal_wa_notified() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        BEGIN
          IF NEW.status = 'pendente' AND OLD.status IS DISTINCT FROM 'pendente' THEN NEW.wa_notified_at := NULL; END IF;
          RETURN NEW;
        END $fn$;
      `).catch((error) => console.error('[whatsapp] gatilho do aviso de portal:', error.message));
      await pool.query(`
        DO $do$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_portal_wa_notified_reset'
                          AND tgrelid = 'public.client_portal_contents'::regclass) THEN
            CREATE TRIGGER trg_portal_wa_notified_reset BEFORE UPDATE ON public.client_portal_contents
            FOR EACH ROW EXECUTE FUNCTION public.reset_portal_wa_notified();
          END IF;
        END $do$;
      `).catch((error) => console.error('[whatsapp] gatilho do aviso de portal:', error.message));
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_job_runs (
          job TEXT NOT NULL,
          day DATE NOT NULL,
          ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          result JSONB,
          PRIMARY KEY (job, day)
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

let historyCity = null;
async function historyHasCity(pool) {
  if (historyCity === null) {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'whatsapp_messages' AND column_name = 'city' LIMIT 1`
    );
    historyCity = rows.length > 0;
  }
  return historyCity;
}

// prazo da mensagem na fila (Date ou texto ISO); inválido ou ausente = só o limite geral de 48 h
function validExpiry(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Coloca uma mensagem na fila. O processo do WhatsApp envia pela conexão que tem a função `purpose`
 * (ou pela "geral"), com intervalo entre mensagens. Também registra no histórico (whatsapp_messages).
 */
export async function enqueueWhatsApp(pool, { to, body, purpose, triggerType, clientId, sentBy, mediaUrl, mediaName, connectionId, expiresAt }) {
  await ensureWhatsAppSchema(pool);
  const target = String(to || '').trim();
  if (!target) throw new Error('Número de destino vazio');
  if (!body && !mediaUrl) throw new Error('Mensagem vazia');
  const finalPurpose = purposeFor(purpose, triggerType);
  const logMessage = mediaUrl ? `${body || ''} [📎 ${mediaName || 'arquivo'}]` : body;
  // o histórico é separado por cidade: grava na cidade do cliente (sem cliente, fica na cidade padrão)
  const withCity = clientId && await historyHasCity(pool);
  const { rows: logRows } = await pool.query(
    withCity
      ? `INSERT INTO whatsapp_messages (phone_number, message, status, api_response, client_id, trigger_type, sent_by, city)
         VALUES ($1, $2, 'fila', $3::jsonb, $4, $5, $6, COALESCE((SELECT city FROM clients WHERE id = $4), 'minacu')) RETURNING id`
      : `INSERT INTO whatsapp_messages (phone_number, message, status, api_response, client_id, trigger_type, sent_by)
         VALUES ($1, $2, 'fila', $3::jsonb, $4, $5, $6) RETURNING id`,
    [target.replace(/\D/g, '') || target, logMessage, JSON.stringify({ purpose: finalPurpose }), clientId || null, triggerType || 'manual', sentBy || null]
  ).catch((error) => {
    console.error('[whatsapp] histórico:', error.message);
    return { rows: [] };
  });
  const { rows } = await pool.query(
    `INSERT INTO wa_outbox (purpose, connection_id, to_number, body, media_url, media_name, client_id, trigger_type, sent_by, log_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [finalPurpose, connectionId || null, target, body || '', mediaUrl || null, mediaName || null, clientId || null,
      triggerType || 'manual', sentBy || null, logRows[0]?.id || null, validExpiry(expiresAt)]
  );
  return { id: rows[0].id, purpose: finalPurpose };
}

/** Clientes cujo grupo cadastrado (jid ou link de convite já resolvido) é este grupo. */
export async function clientsForGroup(pool, groupJid) {
  if (!groupJid) return [];
  const { rows } = await pool.query(
    `SELECT c.id, c.company_name, c.responsible_person, c.whatsapp, c.whatsapp_group
       FROM clients c
       LEFT JOIN wa_jid_cache j
         ON j.number = 'grupo:' || substring(c.whatsapp_group from 'chat\\.whatsapp\\.com/(?:invite/)?([A-Za-z0-9]+)')
      WHERE c.whatsapp_group IS NOT NULL AND trim(c.whatsapp_group) <> ''
        AND (trim(c.whatsapp_group) = $1 OR j.jid = $1)`,
    [groupJid]
  );
  return rows;
}


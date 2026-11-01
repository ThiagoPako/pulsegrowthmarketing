// Assistente PULSE — tabelas próprias (só aditivo; criadas na subida da API, idempotente).
//
//   assistant_settings        liga/desliga do PULSE e do monitor de grupos (uma linha, id = 1)
//   assistant_numbers         números autorizados: nome, telefone, usuário da equipe, cidades e permissões
//   assistant_conversations   histórico curto por número (texto do pedido e da resposta)
//   assistant_pending_actions ações que esperam o "sim" (o payload guardado é o que executa)
//   assistant_log             comandos, ações, negações e números ignorados (também serve de limite por hora)
//   assistant_demands         demandas detectadas nos grupos dos clientes
//   agent_jobs                pedidos para os agentes dos PCs (relatório mensal)
//   marcely_inbox             caixa da Marcely no WhatsApp (pedidos da equipe e o que importa dos grupos; marcelyInbox.mjs)
//
// Nenhuma tabela com client_id tem a coluna "city": o gatilho global de cidade (trg_global_client_city) só
// entra em tabelas com city + client_id, e aqui a cidade é guardada à parte (coluna "cidade").

import { ensureWhatsAppSchema } from '../whatsapp/shared.mjs';
import { ensureInboxSchema } from './marcelyInbox.mjs';

let ready = null;

export function ensureAssistantSchema(pool) {
  if (!ready) {
    ready = (async () => {
      await ensureWhatsAppSchema(pool);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_settings (
          id INTEGER PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT false,
          group_monitor_enabled BOOLEAN NOT NULL DEFAULT false,
          monitor_since TIMESTAMPTZ,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`INSERT INTO assistant_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_numbers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          phone TEXT NOT NULL UNIQUE,
          user_id UUID,
          cities TEXT[] NOT NULL DEFAULT '{}',
          permissions TEXT[] NOT NULL DEFAULT '{}',
          active BOOLEAN NOT NULL DEFAULT true,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_command_at TIMESTAMPTZ
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          number_id UUID NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_conv_number ON assistant_conversations (number_id, created_at DESC)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_pending_actions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          number_id UUID NOT NULL,
          kind TEXT NOT NULL,
          payload JSONB NOT NULL,
          summary TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'comando',
          status TEXT NOT NULL DEFAULT 'pendente',
          result JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL,
          decided_at TIMESTAMPTZ
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_pending_number ON assistant_pending_actions (number_id, status, created_at DESC)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          number_id UUID,
          phone TEXT,
          kind TEXT NOT NULL,
          tool TEXT,
          text TEXT,
          detail JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_log_number ON assistant_log (number_id, kind, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_log_created ON assistant_log (created_at DESC)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assistant_demands (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID,
          cidade TEXT,
          group_jid TEXT NOT NULL,
          kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          suggestion JSONB,
          message_ids TEXT[] NOT NULL DEFAULT '{}',
          excerpt TEXT,
          source_key TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'nova',
          alerted_count INTEGER NOT NULL DEFAULT 0,
          card_kind TEXT,
          card_id UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_assistant_demands_client ON assistant_demands (client_id, created_at DESC)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS agent_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendente',
          client_id UUID,
          params JSONB NOT NULL DEFAULT '{}'::jsonb,
          requested_by_number UUID,
          requested_by_user UUID,
          requested_by_name TEXT,
          claimed_by UUID,
          claimed_by_name TEXT,
          claimed_at TIMESTAMPTZ,
          delivered_at TIMESTAMPTZ,
          files JSONB NOT NULL DEFAULT '[]'::jsonb,
          note TEXT,
          fail_reason TEXT,
          failed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`ALTER TABLE agent_jobs ADD COLUMN IF NOT EXISTS sent_to_client_at TIMESTAMPTZ`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_jobs_status ON agent_jobs (status, created_at)`);
      await ensureInboxSchema(pool);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

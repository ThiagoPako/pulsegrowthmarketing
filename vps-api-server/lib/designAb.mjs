// ─── Arte humana × arte da IA (pedido do usuário, 03/11/2026) ───────────────────────────────────────────────────────
// "Card criado à mão: marcar se vai ser feito por uma pessoa da equipe humana. A designer cria a versão dela e os agentes
// criam também: 2 cards em Design. O card que o agente faz só usuários admin conseguem ver até eu desativar isso. Quero
// comparar a arte humana com a da IA para ver qual o cliente aprova; a que o cliente aprovar, a IA aprende os detalhes."
//
// design_tasks.made_by: 'humano' | 'agente' (nulo = como antes: qualquer um pega). design_tasks.ab_test = true pede o gêmeo.
// Gatilho no INSERT: card humano com ab_test ganha o gêmeo do agente (mesmo briefing), ligados por twin_id.
// Gatilho na aprovação do cliente: a vencedora fica registrada em design_ab_results, a outra sai do Kanban
// (kanban_column 'descartada') e do portal (status 'descartado'), e os designers-agentes recebem o recado com as duas
// para estudar o que o cliente escolheu (o playbook do cliente já traz as artes aprovadas).

export function createDesignAb({ pool, logger = console }) {
  let ready = null;
  function ensureSchema() {
    ready ||= (async () => {
      await pool.query(`
        ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS made_by TEXT;
        ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS ab_test BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS twin_id UUID;
        ALTER TABLE design_tasks ADD COLUMN IF NOT EXISTS ab_result TEXT;
        CREATE TABLE IF NOT EXISTS design_ab_settings (
          id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          enabled BOOLEAN NOT NULL DEFAULT true,
          agent_admin_only BOOLEAN NOT NULL DEFAULT true,
          updated_by UUID,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        INSERT INTO design_ab_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
        CREATE TABLE IF NOT EXISTS design_ab_results (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID,
          human_task_id UUID,
          agent_task_id UUID,
          winner TEXT NOT NULL,
          title TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_design_ab_results_client ON design_ab_results(client_id, created_at DESC);
      `);
      // gêmeo do agente para o card humano em teste A/B
      await pool.query(`
        CREATE OR REPLACE FUNCTION pulse_design_ab_twin() RETURNS trigger AS $fn$
        DECLARE twin UUID; on_ab BOOLEAN;
        BEGIN
          IF NEW.made_by IS DISTINCT FROM 'humano' OR NEW.ab_test IS NOT TRUE OR NEW.twin_id IS NOT NULL OR NEW.client_id IS NULL THEN
            RETURN NULL;
          END IF;
          SELECT enabled INTO on_ab FROM design_ab_settings WHERE id = 1;
          IF on_ab IS NOT TRUE THEN RETURN NULL; END IF;
          INSERT INTO design_tasks (client_id, title, format_type, dimensions, copy_brief, copy_text, references_links,
                                    reference_images, materials_link, priority, description, due_date, created_by,
                                    kanban_column, position, city, made_by, ab_test, twin_id)
          VALUES (NEW.client_id, NEW.title, NEW.format_type, NEW.dimensions, NEW.copy_brief, NEW.copy_text, NEW.references_links,
                  NEW.reference_images, NEW.materials_link, NEW.priority, NEW.description, NEW.due_date, NEW.created_by,
                  'nova_tarefa', 0, NEW.city, 'agente', true, NEW.id)
          RETURNING id INTO twin;
          UPDATE design_tasks SET twin_id = twin WHERE id = NEW.id;
          RETURN NULL;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_design_ab_twin: %', SQLERRM;
          RETURN NULL;
        END
        $fn$ LANGUAGE plpgsql
      `);
      await pool.query(`DROP TRIGGER IF EXISTS trg_design_ab_twin ON design_tasks`);
      await pool.query(`CREATE TRIGGER trg_design_ab_twin AFTER INSERT ON design_tasks FOR EACH ROW EXECUTE FUNCTION pulse_design_ab_twin()`);

      // o cliente aprovou uma das duas: registra, tira a outra e avisa os designers-agentes
      await pool.query(`
        CREATE OR REPLACE FUNCTION pulse_design_ab_result() RETURNS trigger AS $fn$
        DECLARE other RECORD; ag RECORD; nome TEXT;
        BEGIN
          IF NEW.twin_id IS NULL OR NEW.client_approved_at IS NULL OR OLD.client_approved_at IS NOT NULL OR NEW.ab_result IS NOT NULL THEN
            RETURN NULL;
          END IF;
          SELECT id, title, made_by, client_approved_at INTO other FROM design_tasks WHERE id = NEW.twin_id;
          IF other.id IS NULL OR other.client_approved_at IS NOT NULL THEN RETURN NULL; END IF;
          INSERT INTO design_ab_results (client_id, human_task_id, agent_task_id, winner, title)
          VALUES (NEW.client_id,
                  CASE WHEN NEW.made_by = 'humano' THEN NEW.id ELSE other.id END,
                  CASE WHEN NEW.made_by = 'agente' THEN NEW.id ELSE other.id END,
                  COALESCE(NEW.made_by, 'humano'), NEW.title);
          UPDATE design_tasks SET ab_result = 'venceu' WHERE id = NEW.id;
          UPDATE design_tasks SET ab_result = 'perdeu', kanban_column = 'descartada', updated_at = now() WHERE id = other.id;
          UPDATE client_portal_contents SET status = 'descartado', updated_at = now()
            WHERE design_task_id = other.id AND status NOT IN ('aprovado', 'agendado', 'publicado');
          SELECT company_name INTO nome FROM clients WHERE id = NEW.client_id;
          FOR ag IN SELECT user_id FROM agent_keys WHERE revoked_at IS NULL AND role = 'designer' LOOP
            INSERT INTO agent_messages (from_user, to_user, body) VALUES (NULL, ag.user_id,
              '🏆 ' || COALESCE(nome, 'O cliente') || ' escolheu a arte ' || CASE WHEN NEW.made_by = 'agente' THEN 'da IA' ELSE 'da equipe humana' END ||
              ' em "' || NEW.title || '" (aprovada: card ' || NEW.id || '; a outra: card ' || other.id || '). ' ||
              'Abra as duas (pulse arte ver) e anote no aprendizado do cliente o que fez ele escolher: cor, tipografia, foto, hierarquia, texto.');
          END LOOP;
          RETURN NULL;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'pulse_design_ab_result: %', SQLERRM;
          RETURN NULL;
        END
        $fn$ LANGUAGE plpgsql
      `);
      await pool.query(`DROP TRIGGER IF EXISTS trg_design_ab_result ON design_tasks`);
      await pool.query(`CREATE TRIGGER trg_design_ab_result AFTER UPDATE OF client_approved_at ON design_tasks FOR EACH ROW EXECUTE FUNCTION pulse_design_ab_result()`);
    })().catch((error) => { ready = null; logger.error?.('[design-ab] esquema:', error.message); throw error; });
    return ready;
  }

  async function settings() {
    await ensureSchema();
    const { rows: [s] } = await pool.query(`SELECT enabled, agent_admin_only FROM design_ab_settings WHERE id = 1`);
    return s || { enabled: true, agent_admin_only: true };
  }

  async function saveSettings({ enabled, agent_admin_only }, userId) {
    await ensureSchema();
    await pool.query(
      `UPDATE design_ab_settings SET enabled = COALESCE($1, enabled), agent_admin_only = COALESCE($2, agent_admin_only), updated_by = $3, updated_at = now() WHERE id = 1`,
      [typeof enabled === 'boolean' ? enabled : null, typeof agent_admin_only === 'boolean' ? agent_admin_only : null, userId || null]
    );
    return settings();
  }

  /** Placar humano × IA (geral e por cliente). */
  async function scoreboard() {
    await ensureSchema();
    const { rows: total } = await pool.query(`SELECT winner, count(*)::int AS n FROM design_ab_results GROUP BY winner`);
    const { rows: byClient } = await pool.query(
      `SELECT r.client_id, c.company_name, count(*) FILTER (WHERE r.winner = 'humano')::int AS humano,
              count(*) FILTER (WHERE r.winner = 'agente')::int AS agente
         FROM design_ab_results r LEFT JOIN clients c ON c.id = r.client_id GROUP BY 1, 2 ORDER BY count(*) DESC LIMIT 30`
    );
    const n = (w) => total.find((t) => t.winner === w)?.n || 0;
    return { humano: n('humano'), agente: n('agente'), clients: byClient };
  }

  return { ensureSchema, settings, saveSettings, scoreboard };
}

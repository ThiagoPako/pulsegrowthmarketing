// Assistente PULSE — aviso de vídeo em Revisão (pedido do usuário, 31/10/2026: "quando um vídeo entrar em Revisão me avisa").
//
// A cada minuto o PULSE olha a coluna Revisão do Kanban de Conteúdo. Card que entrou desde a última olhada (por qualquer
// caminho: o ✅ do Uriel, a Marcely, o editor humano, o kanban) vai numa mensagem só para cada número com a permissão
// "aviso_revisao", nas cidades daquele número. A tabela pulse_revisao_vistos guarda quem já está na coluna: card que sai e
// volta (alteração) avisa de novo. Na primeira olhada, os que já estavam lá só entram na tabela, sem aviso.
import { logEvent, remember, sendToNumber, clip } from './common.mjs';

export function createRevisionAlert({ pool, intervalMs = 60_000 }) {
  let running = false;
  async function check() {
    if (running) return null;
    running = true;
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS pulse_revisao_vistos (
        task_id UUID PRIMARY KEY, seen_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      // saiu da Revisão: esquece, para avisar de novo se voltar
      await pool.query(`DELETE FROM pulse_revisao_vistos v WHERE NOT EXISTS (
        SELECT 1 FROM content_tasks t WHERE t.id = v.task_id AND t.kanban_column = 'revisao')`);
      const { rows: [{ vazio }] } = await pool.query(`SELECT NOT EXISTS (SELECT 1 FROM pulse_job_runs WHERE job = 'aviso_revisao') AS vazio`)
        .catch(async () => {
          await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (
            job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB, PRIMARY KEY (job, day))`);
          return { rows: [{ vazio: true }] };
        });
      const { rows: novos } = await pool.query(
        `INSERT INTO pulse_revisao_vistos (task_id)
           SELECT id FROM content_tasks WHERE kanban_column = 'revisao'
         ON CONFLICT (task_id) DO NOTHING RETURNING task_id`
      );
      if (vazio) {
        // primeira vez: o que já estava na coluna não é novidade
        await pool.query(`INSERT INTO pulse_job_runs (job, day, result) VALUES ('aviso_revisao', '1970-01-01', '{"semeado":true}')
                          ON CONFLICT DO NOTHING`);
        return { avisados: 0, semeados: novos.length };
      }
      if (!novos.length) return { avisados: 0 };
      const { rows: cards } = await pool.query(
        `SELECT t.id, t.title, t.content_type, t.urgent_at, c.company_name AS cliente, coalesce(c.city, t.city) AS city,
                (SELECT coalesce(nullif(p.display_name, ''), p.name) FROM task_history h JOIN profiles p ON p.id = h.user_id
                  WHERE h.task_id = t.id AND h.action ~* 'revis' ORDER BY h.created_at DESC LIMIT 1) AS por
           FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id
          WHERE t.id = ANY($1::uuid[]) ORDER BY c.company_name, t.title`, [novos.map((r) => r.task_id)]
      );
      const { rows: numbers } = await pool.query(
        `SELECT * FROM assistant_numbers WHERE active AND 'aviso_revisao' = ANY(permissions)`
      );
      let avisados = 0;
      for (const number of numbers) {
        const cities = number.cities || [];
        const meus = cards.filter((c) => !cities.length || cities.includes(c.city));
        if (!meus.length) continue;
        const body = [
          `*🎬 Entrou em Revisão* (${meus.length})`,
          ...meus.map((c) => `• ${c.urgent_at ? '🔥 ' : ''}${clip((c.cliente || '').trim(), 28)} · ${clip(c.title || '', 70)}${c.por ? ` — ${c.por}` : ''}`),
          '',
          'Já pode revisar no sistema.',
        ].join('\n');
        try {
          await sendToNumber(pool, number, body);
          await remember(pool, number.id, 'assistant', body);
          await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'aviso_revisao', text: `${meus.length} card(s)` });
          avisados++;
        } catch (error) {
          console.error('[aviso de revisão]', number.name, error.message);
        }
      }
      return { avisados, cards: cards.length };
    } catch (error) {
      console.error('[aviso de revisão]', error.message);
      return null;
    } finally {
      running = false;
    }
  }
  let timer = null;
  return {
    check,
    start() {
      if (timer) return;
      check().catch(() => {});
      timer = setInterval(() => check().catch(() => {}), intervalMs);
      timer.unref?.();
    },
  };
}

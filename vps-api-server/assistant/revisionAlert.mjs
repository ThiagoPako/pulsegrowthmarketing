// Assistente PULSE — avisos de card que chega para aprovar.
//   aviso_revisao (pedido do usuário, 31/10/2026: "quando um vídeo entrar em Revisão me avisa"): todo vídeo que entra na
//     coluna Revisão do Kanban de Conteúdo.
//   aviso_aprovacao (31/10/2026: "avise sempre quando uma arte for enviada para aprovação e quando vídeos urgentes forem
//     enviados para aprovação"): arte que entra em Em Análise (revisão da equipe) no Kanban de Design e vídeo urgente
//     (🔥) em Revisão.
//
// A cada minuto o PULSE olha as colunas. Card que entrou desde a última olhada (por qualquer caminho: agente, equipe,
// kanban) vai numa mensagem só para cada número com a permissão, nas cidades daquele número. A tabela
// pulse_aviso_vistos guarda quem já está em cada coluna: card que sai e volta (alteração) avisa de novo. Na primeira
// olhada de cada aviso, os que já estavam lá só entram na tabela, sem aviso.
import { logEvent, remember, sendToNumber, clip } from './common.mjs';

const POR = (hist, alias) => `(SELECT coalesce(nullif(p.display_name, ''), p.name) FROM ${hist} h JOIN profiles p ON p.id = h.user_id
   WHERE h.task_id = ${alias}.id ORDER BY h.created_at DESC LIMIT 1)`;

// cada aviso: quem está na coluna agora (ids) e os dados dos novos (rows: id, title, urgente, cliente, city, por)
const WATCHES = [
  {
    kind: 'revisao', permission: 'aviso_revisao', title: '🎬 Entrou em Revisão',
    ids: `SELECT id FROM content_tasks WHERE kanban_column = 'revisao'`,
    rows: `SELECT t.id, t.title, t.urgent_at IS NOT NULL AS urgente, c.company_name AS cliente, coalesce(c.city, t.city) AS city,
                  ${POR('task_history', 't')} AS por
             FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ANY($1::uuid[])`,
  },
  {
    kind: 'video_urgente', permission: 'aviso_aprovacao', title: '🔥 Vídeo urgente para aprovar',
    ids: `SELECT id FROM content_tasks WHERE kanban_column = 'revisao' AND urgent_at IS NOT NULL`,
    rows: `SELECT t.id, t.title, false AS urgente, c.company_name AS cliente, coalesce(c.city, t.city) AS city,
                  ${POR('task_history', 't')} AS por
             FROM content_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ANY($1::uuid[])`,
  },
  {
    kind: 'arte', permission: 'aviso_aprovacao', title: '🎨 Arte para aprovar',
    ids: `SELECT id FROM design_tasks WHERE kanban_column = 'em_analise'`,
    rows: `SELECT t.id, t.title, false AS urgente, c.company_name AS cliente, coalesce(c.city, t.city) AS city,
                  ${POR('design_task_history', 't')} AS por
             FROM design_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ANY($1::uuid[])`,
  },
];

export function createRevisionAlert({ pool, intervalMs = 60_000 }) {
  let running = false;
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS pulse_aviso_vistos (
      kind TEXT NOT NULL, task_id UUID NOT NULL, seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (kind, task_id))`);
    // a primeira versão (só Revisão) guardava em pulse_revisao_vistos: herda, para não repetir o aviso
    await pool.query(`INSERT INTO pulse_aviso_vistos (kind, task_id, seen_at)
                        SELECT 'revisao', task_id, seen_at FROM pulse_revisao_vistos ON CONFLICT DO NOTHING`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (
      job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB, PRIMARY KEY (job, day))`);
    schemaReady = true;
  }

  /** Atualiza os vistos de um aviso e devolve os cards novos ([] na primeira olhada, que só semeia). */
  async function newCards(w) {
    await pool.query(`DELETE FROM pulse_aviso_vistos v WHERE v.kind = $1 AND v.task_id NOT IN (${w.ids})`, [w.kind]);
    const { rows: novos } = await pool.query(
      `INSERT INTO pulse_aviso_vistos (kind, task_id) SELECT $1, id FROM (${w.ids}) x ON CONFLICT DO NOTHING RETURNING task_id`, [w.kind]
    );
    const job = w.kind === 'revisao' ? 'aviso_revisao' : `aviso_${w.kind}`;
    const { rows: [semeado] } = await pool.query(`SELECT 1 FROM pulse_job_runs WHERE job = $1`, [job]);
    if (!semeado) {
      await pool.query(`INSERT INTO pulse_job_runs (job, day, result) VALUES ($1, '1970-01-01', '{"semeado":true}') ON CONFLICT DO NOTHING`, [job]);
      return [];
    }
    if (!novos.length) return [];
    const { rows } = await pool.query(`${w.rows} ORDER BY 4, 2`, [novos.map((r) => r.task_id)]);
    return rows;
  }

  async function check() {
    if (running) return null;
    running = true;
    try {
      await ensureSchema();
      const blocos = []; // { permission, title, cards }
      for (const w of WATCHES) {
        const cards = await newCards(w).catch((error) => {
          console.error(`[aviso ${w.kind}]`, error.message);
          return [];
        });
        if (cards.length) blocos.push({ permission: w.permission, title: w.title, cards });
      }
      if (!blocos.length) return { avisados: 0 };
      const { rows: numbers } = await pool.query(
        `SELECT * FROM assistant_numbers WHERE active AND permissions && $1::text[]`, [[...new Set(blocos.map((b) => b.permission))]]
      );
      let avisados = 0;
      for (const number of numbers) {
        const cities = number.cities || [];
        const partes = [];
        for (const b of blocos) {
          if (!(number.permissions || []).includes(b.permission)) continue;
          const meus = b.cards.filter((c) => !cities.length || cities.includes(c.city));
          if (!meus.length) continue;
          partes.push([
            `*${b.title}* (${meus.length})`,
            ...meus.map((c) => `• ${c.urgente ? '🔥 ' : ''}${clip((c.cliente || '').trim(), 28)} · ${clip(c.title || '', 70)}${c.por ? ` — ${c.por}` : ''}`),
          ].join('\n'));
        }
        if (!partes.length) continue;
        const body = `${partes.join('\n\n')}\n\nJá pode olhar no sistema.`;
        try {
          await sendToNumber(pool, number, body);
          await remember(pool, number.id, 'assistant', body);
          await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'aviso_aprovacao', text: clip(partes.map((p) => p.split('\n')[0]).join(' · '), 200) });
          avisados++;
        } catch (error) {
          console.error('[aviso de aprovação]', number.name, error.message);
        }
      }
      return { avisados };
    } catch (error) {
      console.error('[aviso de aprovação]', error.message);
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

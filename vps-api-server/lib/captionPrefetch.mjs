// ─── Legenda pronta antes de pedirem (pedido do usuário, 01/11/2026) ─────────────────────
// "As ferramentas de IA não podem ser demoradas, como gerar legendas e criar roteiros; o agente deve estar
// pré-preparado para entregar rápido isso." Em segundo plano, o servidor escreve a legenda de cada material que vai
// ser postado e ainda não tem legenda: vídeo que entrou em "Enviado ao cliente" (envio), Agendamentos ou
// Acompanhamento, e arte aprovada. A legenda fica salva em scheduling_captions (generated = true) e aparece no
// Agendamentos ao abrir o material; quem quiser outra clica em "Gerar" de novo.
// Uma por vez (a análise do vídeo usa ffmpeg e whisper), algumas a cada rodada; o que falhou só tenta de novo em 6 h.
// Arrastar no Agendamentos põe o material na frente da fila (enqueue). PULSE_CAPTION_PREFETCH=0 desliga.

const TICK_MS = 3 * 60_000;
const PER_TICK = 4;
const RETRY_AFTER_MS = 6 * 60 * 60_000;

/** Materiais sem legenda que vão ser postados (os mais recentes primeiro). */
export const CANDIDATES_SQL = `
  (SELECT 'conteudo' AS kind, t.id, t.client_id, t.updated_at
     FROM content_tasks t LEFT JOIN scripts s ON s.id = t.script_id
    WHERE t.kanban_column IN ('envio', 'agendamentos', 'acompanhamento')
      AND coalesce(t.content_type, '') NOT IN ('criativo', 'story', 'otimizacao')
      AND t.client_id IS NOT NULL
      AND t.updated_at > now() - interval '30 days'
      AND coalesce(s.caption, '') = ''
      AND NOT EXISTS (SELECT 1 FROM scheduling_captions c WHERE c.kind = 'conteudo' AND c.material_id = t.id AND c.caption <> '')
      AND NOT EXISTS (SELECT 1 FROM scheduled_posts sp WHERE sp.content_task_id = t.id AND coalesce(sp.caption, '') <> ''))
  UNION ALL
  (SELECT 'arte' AS kind, d.id, d.client_id, d.updated_at
     FROM design_tasks d
    WHERE d.kanban_column = 'aprovado'
      AND coalesce(d.format_type, '') <> ALL($1::text[])
      AND d.client_id IS NOT NULL
      AND d.updated_at > now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM scheduling_captions c WHERE c.kind = 'arte' AND c.material_id = d.id AND c.caption <> '')
      AND NOT EXISTS (SELECT 1 FROM scheduled_posts sp WHERE sp.design_task_id = d.id AND coalesce(sp.caption, '') <> ''))
  ORDER BY updated_at DESC
  LIMIT 30`;

export function createCaptionPrefetch({
  pool, postCaption, captionContext, saveCaption, excludedDesignFormats = [], logger = console, env = process.env,
  now = () => Date.now(),
}) {
  const enabled = env.PULSE_CAPTION_PREFETCH !== '0' && !!postCaption;
  const failed = new Map(); // "kind:id" → quando falhou
  const front = []; // pedidos de agora (arrastou no Agendamentos), antes da varredura
  let running = false;
  let timer = null;

  const key = (kind, id) => `${kind}:${id}`;

  async function hasCaption(kind, id) {
    const { rows } = await pool.query(
      `SELECT 1 FROM scheduling_captions WHERE kind = $1 AND material_id = $2 AND caption <> '' LIMIT 1`, [kind, id]
    );
    return rows.length > 0;
  }

  /** Escreve e guarda a legenda de um material (se ninguém escreveu uma enquanto isso). */
  async function prepareOne({ kind, id, client_id: clientId }) {
    const k = key(kind, id);
    const failedAt = failed.get(k);
    if (failedAt && now() - failedAt < RETRY_AFTER_MS) return 'adiado';
    try {
      const ctx = await captionContext(kind, id, clientId);
      const started = now();
      const result = await postCaption.generate(ctx);
      if (await hasCaption(kind, id)) return 'ja-tinha';
      await saveCaption(pool, { kind, id, clientId, caption: result.caption, userId: null, generated: true });
      failed.delete(k);
      logger.log?.(`[legenda pronta] ${k} (${result.fonte}) em ${Math.round((now() - started) / 100) / 10} s`);
      return 'pronta';
    } catch (error) {
      failed.set(k, now());
      logger.warn?.(`[legenda pronta] ${k} falhou:`, error?.message || error);
      return 'falhou';
    }
  }

  async function tick() {
    if (!enabled || running) return;
    running = true;
    try {
      let done = 0;
      while (front.length && done < PER_TICK) {
        const item = front.shift();
        if (!(await hasCaption(item.kind, item.id))) {
          await prepareOne(item);
          done++;
        }
      }
      if (done >= PER_TICK) return;
      const { rows } = await pool.query(CANDIDATES_SQL, [excludedDesignFormats]);
      for (const row of rows) {
        if (done >= PER_TICK) break;
        const result = await prepareOne(row);
        if (result !== 'adiado') done++;
      }
    } catch (error) {
      logger.warn?.('[legenda pronta] varredura:', error?.message || error);
    } finally {
      running = false;
    }
  }

  /** Material mexido agora (arrastado no Agendamentos): entra na frente e a rodada começa já. */
  function enqueue(kind, id, clientId) {
    if (!enabled || !['conteudo', 'arte'].includes(kind) || !id || !clientId) return;
    if (front.some((f) => f.kind === kind && f.id === id)) return;
    front.push({ kind, id, client_id: clientId });
    setTimeout(() => { tick(); }, 2_000).unref?.();
  }

  function start({ after } = {}) {
    if (!enabled || timer) return;
    const begin = () => {
      setTimeout(() => { tick(); }, 60_000).unref?.();
      timer = setInterval(() => { tick(); }, TICK_MS);
      timer.unref?.();
    };
    if (after) after().then(begin, begin);
    else begin();
  }

  return { start, tick, enqueue, prepareOne, enabled };
}

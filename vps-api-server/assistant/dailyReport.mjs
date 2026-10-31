// Assistente PULSE — resumo do dia (pedido do usuário, 31/10/2026: "o agente PULSE enviar todos os dias às 18h tudo que
// foi feito no dia").
//
// Uma vez por dia, a partir de DAILY_REPORT_HOUR (18h de Brasília), o PULSE manda no WhatsApp de cada número com a
// permissão "resumo_diario" o que a agência fez no dia, nas cidades daquele número. Tudo sai do banco, sem o Claude (os
// números são os do sistema, e o texto não custa nada): histórico dos cards de vídeo (task_history) e de design
// (design_task_history), versões entregues (edit_versions), gravações (recordings), cards novos e a fila agora.
// Marcado em pulse_job_runs (job "resumo_diario"): reinício do servidor não manda duas vezes.
import { getSettings, logEvent, remember, sendToNumber, brazilToday, cityLabel, clip } from './common.mjs';

const JOB = 'resumo_diario';
const TZ = 'America/Sao_Paulo';
const brazilHour = (date = new Date()) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(date));
const weekday = (date = new Date()) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(date);
const dayLabel = (date = new Date()) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(date);

// "hoje" no fuso de Brasília, para filtrar created_at
const TODAY = `(created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`;
const TODAY_H = `(h.created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`;

/** Números e lista do dia nas cidades dadas (null = todas). */
export async function collectDay(pool, cities) {
  const cityFilter = (alias = '') => (cities?.length ? `AND ${alias}city = ANY($1::text[])` : '');
  const params = cities?.length ? [cities] : [];
  const q = (sql) => pool.query(sql, params).then((r) => r.rows).catch((error) => {
    console.error('[resumo do dia]', error.message);
    return [];
  });
  const [hist, entregas, design, gravacoes, novos, fila, porCliente, pessoasHist, pessoasEntrega, pessoasDesign, pessoasGravacao] = await Promise.all([
    q(`SELECT h.action, count(*)::int AS n FROM task_history h WHERE ${TODAY_H} ${cityFilter('h.')} GROUP BY 1`),
    q(`SELECT (v.created_by IN (SELECT user_id FROM agent_keys)) AS agente, count(DISTINCT v.task_id)::int AS n
         FROM edit_versions v JOIN content_tasks t ON t.id = v.task_id
        WHERE (v.created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date ${cityFilter('t.')} GROUP BY 1`),
    q(`SELECT h.action, count(*)::int AS n FROM design_task_history h WHERE ${TODAY_H} ${cityFilter('h.')} GROUP BY 1`),
    q(`SELECT status, count(*)::int AS n FROM recordings WHERE date = (now() AT TIME ZONE '${TZ}')::date ${cityFilter()} GROUP BY 1`),
    q(`SELECT 'video' AS tipo, count(*)::int AS n FROM content_tasks WHERE ${TODAY} ${cityFilter()}
       UNION ALL SELECT 'design', count(*)::int FROM design_tasks WHERE ${TODAY} ${cityFilter()}`),
    q(`SELECT kanban_column AS col, count(*)::int AS n,
              count(*) FILTER (WHERE urgent_at IS NOT NULL)::int AS urgentes,
              count(*) FILTER (WHERE waiting_material_at IS NOT NULL)::int AS aguardando
         FROM content_tasks WHERE kanban_column IN ('edicao', 'alteracao', 'pre_revisao', 'revisao') ${cityFilter()} GROUP BY 1`),
    q(`SELECT c.company_name AS cliente, count(*)::int AS n
         FROM task_history h JOIN content_tasks t ON t.id = h.task_id JOIN clients c ON c.id = t.client_id
        WHERE ${TODAY_H} AND h.action IN ('Enviado para Cliente', 'Enviado para Revisão', 'Enviado para revisão') ${cityFilter('h.')}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 6`),
    // quem fez o quê (pedido do usuário, 31/10/2026: "quero que ele mande quem fez o que")
    q(`SELECT coalesce(nullif(p.display_name, ''), p.name) AS nome, (h.user_id IN (SELECT user_id FROM agent_keys)) AS agente,
              count(*) FILTER (WHERE h.action ~* '^Enviado para revis')::int AS para_revisao,
              count(*) FILTER (WHERE h.action = 'Enviado para Cliente')::int AS para_cliente,
              count(*) FILTER (WHERE h.action = 'Alteração iniciada')::int AS alteracoes,
              count(*) FILTER (WHERE h.action = 'Solicitado Alteração')::int AS pediu_alteracao,
              count(*) FILTER (WHERE h.action ~ '^✅ Aprovado')::int AS aprovou,
              count(*) FILTER (WHERE h.action = 'Parecer da Análise')::int AS pareceres
         FROM task_history h JOIN profiles p ON p.id = h.user_id
        WHERE ${TODAY_H} ${cityFilter('h.')} GROUP BY 1, 2`),
    q(`SELECT coalesce(nullif(p.display_name, ''), p.name) AS nome, count(DISTINCT v.task_id)::int AS n
         FROM edit_versions v JOIN content_tasks t ON t.id = v.task_id JOIN profiles p ON p.id = v.created_by
        WHERE (v.created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date ${cityFilter('t.')} GROUP BY 1`),
    q(`SELECT coalesce(nullif(p.display_name, ''), p.name) AS nome,
              count(*) FILTER (WHERE h.action ~* '^Arte (enviada|entregue|corrigida)')::int AS artes,
              count(*) FILTER (WHERE h.action ~* '^(Aprovada|Ajustes solicitados)')::int AS conferiu
         FROM design_task_history h JOIN profiles p ON p.id = h.user_id
        WHERE ${TODAY_H} ${cityFilter('h.')} GROUP BY 1`),
    q(`SELECT coalesce(nullif(p.display_name, ''), p.name) AS nome, count(*)::int AS n
         FROM recordings r JOIN profiles p ON p.id = r.videomaker_id
        WHERE r.date = (now() AT TIME ZONE '${TZ}')::date AND coalesce(r.status, '') !~* 'cancel' ${cityFilter('r.')} GROUP BY 1`),
  ]);
  const acao = (rows, test) => rows.filter((r) => test(r.action)).reduce((s, r) => s + r.n, 0);
  const colunas = Object.fromEntries(fila.map((r) => [r.col, r]));
  return {
    entreguesAgentes: entregas.find((r) => r.agente)?.n || 0,
    entreguesEquipe: entregas.find((r) => !r.agente)?.n || 0,
    paraRevisao: acao(hist, (a) => /^Enviado para revis/i.test(a)),
    paraCliente: acao(hist, (a) => a === 'Enviado para Cliente'),
    aprovados: acao(hist, (a) => /^✅ Aprovado/.test(a)),
    alteracoesPedidas: acao(hist, (a) => a === 'Solicitado Alteração'),
    alteracoesFeitas: acao(hist, (a) => a === 'Alteração iniciada'),
    artesEntregues: acao(design, (a) => /^Arte (enviada|entregue|corrigida)/i.test(a)),
    artesAprovadas: acao(design, (a) => /^Aprovada/i.test(a)),
    artesAjustes: acao(design, (a) => /^Ajustes solicitados/i.test(a)),
    gravacoes: gravacoes.filter((r) => !/cancel/i.test(r.status || '')).reduce((s, r) => s + r.n, 0),
    gravacoesCanceladas: gravacoes.filter((r) => /cancel/i.test(r.status || '')).reduce((s, r) => s + r.n, 0),
    cardsVideo: novos.find((r) => r.tipo === 'video')?.n || 0,
    cardsDesign: novos.find((r) => r.tipo === 'design')?.n || 0,
    fila: {
      edicao: colunas.edicao?.n || 0, alteracao: colunas.alteracao?.n || 0, analise: colunas.pre_revisao?.n || 0, revisao: colunas.revisao?.n || 0,
      urgentes: fila.reduce((s, r) => s + r.urgentes, 0), aguardando: fila.reduce((s, r) => s + r.aguardando, 0),
    },
    porCliente,
    pessoas: quemFez({ pessoasHist, pessoasEntrega, pessoasDesign, pessoasGravacao }),
  };
}

/** Junta as contas de cada pessoa numa linha ("Davi: 9 vídeo(s) entregues, 16 alterações"), quem fez mais primeiro. */
function quemFez({ pessoasHist, pessoasEntrega, pessoasDesign, pessoasGravacao }) {
  const pessoas = new Map();
  const de = (nome) => {
    const chave = String(nome || '').trim();
    if (!pessoas.has(chave)) pessoas.set(chave, { nome: chave, agente: false, itens: [], total: 0 });
    return pessoas.get(chave);
  };
  const soma = (p, n, texto) => { if (n > 0) { p.itens.push(`${n} ${texto}`); p.total += n; } };
  for (const r of pessoasGravacao) soma(de(r.nome), r.n, 'gravação(ões)');
  for (const r of pessoasEntrega) soma(de(r.nome), r.n, 'vídeo(s) entregue(s)');
  for (const r of pessoasHist) {
    const p = de(r.nome);
    p.agente ||= r.agente;
    soma(p, r.alteracoes, 'alteração(ões) feita(s)');
    soma(p, r.pareceres, 'parecer(es) na Análise');
    soma(p, r.para_revisao, 'liberado(s) para a revisão');
    soma(p, r.para_cliente, 'enviado(s) ao cliente');
    soma(p, r.pediu_alteracao, 'alteração(ões) pedida(s)');
    soma(p, r.aprovou, 'aprovação(ões)');
  }
  for (const r of pessoasDesign) {
    const p = de(r.nome);
    soma(p, r.artes, 'arte(s) entregue(s)');
    soma(p, r.conferiu, 'arte(s) conferida(s)');
  }
  return [...pessoas.values()].filter((p) => p.nome && p.itens.length).sort((a, b) => b.total - a.total);
}

/** Texto do WhatsApp (formato do PULSE: *negrito*, "•", sem tabela). */
export function formatDay(d, cities, date = new Date()) {
  const lugar = cities?.length ? cities.map(cityLabel).join(' e ') : 'todas as cidades';
  const linhas = [`*📊 Resumo do dia · ${dayLabel(date)} (${weekday(date)})* · ${lugar}`, ''];
  const entregues = d.entreguesAgentes + d.entreguesEquipe;
  linhas.push('*🎬 Vídeos*');
  linhas.push(`• ${entregues} entregue(s) pela edição${entregues ? ` (agentes ${d.entreguesAgentes} · equipe ${d.entreguesEquipe})` : ''}`);
  linhas.push(`• ${d.paraRevisao} liberado(s) para a revisão da equipe`);
  linhas.push(`• ${d.paraCliente} enviado(s) ao cliente${d.aprovados ? ` · ${d.aprovados} aprovado(s)` : ''}`);
  linhas.push(`• ${d.alteracoesPedidas} alteração(ões) pedida(s) · ${d.alteracoesFeitas} começada(s)`);
  if (d.porCliente.length) linhas.push(`• Mais movimento: ${d.porCliente.map((c) => `${clip(c.cliente.trim(), 28)} (${c.n})`).join(', ')}`);
  linhas.push('', '*🎨 Artes*');
  linhas.push(`• ${d.artesEntregues} entregue(s) · ${d.artesAprovadas} aprovada(s) na pré-análise · ${d.artesAjustes} com ajuste pedido`);
  linhas.push('', '*📅 Gravações e cards*');
  linhas.push(`• ${d.gravacoes} gravação(ões) hoje${d.gravacoesCanceladas ? ` · ${d.gravacoesCanceladas} cancelada(s)` : ''}`);
  linhas.push(`• ${d.cardsVideo} card(s) de vídeo e ${d.cardsDesign} de arte criados`);
  if (d.pessoas?.length) {
    linhas.push('', '*👥 Quem fez o quê*');
    for (const p of d.pessoas) linhas.push(`• ${p.agente ? '🤖 ' : ''}*${clip(p.nome, 24)}*: ${p.itens.join(', ')}`);
  }
  linhas.push('', '*📌 Fila agora*');
  linhas.push(`• Edição ${d.fila.edicao} · Alteração ${d.fila.alteracao} · Análise ${d.fila.analise} · Revisão ${d.fila.revisao}`);
  if (d.fila.urgentes || d.fila.aguardando) {
    linhas.push(`• ${d.fila.urgentes ? `🔥 ${d.fila.urgentes} urgente(s)` : ''}${d.fila.urgentes && d.fila.aguardando ? ' · ' : ''}${d.fila.aguardando ? `⏸ ${d.fila.aguardando} aguardando material` : ''}`);
  }
  return linhas.join('\n');
}

export function createDailyReport({ pool, hour = 18, intervalMs = 300_000 }) {
  let running = false;
  async function runDaily({ force = false } = {}) {
    if (running) return null;
    running = true;
    try {
      if (!force && brazilHour() < hour) return null;
      const settings = await getSettings(pool).catch(() => ({ enabled: false }));
      if (!settings?.enabled) return null;
      const today = brazilToday();
      await pool.query(`CREATE TABLE IF NOT EXISTS pulse_job_runs (
        job TEXT NOT NULL, day DATE NOT NULL, ran_at TIMESTAMPTZ NOT NULL DEFAULT now(), result JSONB, PRIMARY KEY (job, day))`);
      if (!force) {
        const { rows: claimed } = await pool.query(
          `INSERT INTO pulse_job_runs (job, day) VALUES ($1, $2::date)
           ON CONFLICT (job, day) DO UPDATE SET ran_at = now()
            WHERE pulse_job_runs.result IS NULL AND pulse_job_runs.ran_at < now() - interval '2 hours'
           RETURNING job`, [JOB, today]
        );
        if (!claimed.length) return null;
      }
      const { rows: numbers } = await pool.query(
        `SELECT * FROM assistant_numbers WHERE active AND 'resumo_diario' = ANY(permissions)`
      );
      let sent = 0;
      for (const number of numbers) {
        try {
          const cities = number.cities || [];
          const body = formatDay(await collectDay(pool, cities), cities);
          await sendToNumber(pool, number, body);
          await remember(pool, number.id, 'assistant', body);
          await logEvent(pool, { numberId: number.id, phone: number.phone, kind: 'resumo_diario', text: today });
          sent++;
        } catch (error) {
          console.error('[resumo do dia]', number.name, error.message);
        }
      }
      if (!force) await pool.query(`UPDATE pulse_job_runs SET result = $3 WHERE job = $1 AND day = $2::date`, [JOB, today, JSON.stringify({ enviados: sent })]);
      console.log(`[resumo do dia] enviado a ${sent} número(s)`);
      return { enviados: sent };
    } catch (error) {
      console.error('[resumo do dia]', error.message);
      return null;
    } finally {
      running = false;
    }
  }
  let timer = null;
  return {
    runDaily,
    start() {
      if (timer) return;
      timer = setInterval(() => runDaily().catch(() => {}), intervalMs);
      timer.unref?.();
    },
  };
}

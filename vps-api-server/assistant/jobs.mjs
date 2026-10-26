// Pedidos para os agentes dos PCs (agent_jobs) — hoje, o relatório mensal pedido pelo PULSE.
// Autenticação igual às outras rotas de agente: cabeçalho "Authorization: Agent <chave>" (tabela agent_keys).
//
//   GET  /api/agent/jobs?status=pendente          → { jobs: [{ id, type, status, client: { id, company_name, city },
//                                                      params, requested_by_name, created_at, … }] }
//   POST /api/agent/jobs/:id/claim                → 200 { job } | 409 se outro agente já pegou
//   POST /api/agent/jobs/:id/deliver              multipart: files (um ou mais) + note (opcional) → { job }
//                                                   grava em /uploads/relatorios/… e avisa quem pediu pelo PULSE
//   POST /api/agent/jobs/:id/fail   { reason }    → { job } e avisa quem pediu
//   GET  /api/agent/clients/:id/report-data?month=AAAA-MM → dados do mês para o relatório
//
// Status do pedido: pendente → em_andamento (claim) → entregue (deliver) | falhou (fail).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import {
  brazilToday, brazilMonth, clientCity, cityLabel, clip, getNumber, isMonth, logEvent, monthLabel, monthRange,
  sendToNumber, remember,
} from './common.mjs';
import { proposeAction, isUuid, loadClient } from './actions.mjs';

const JOB_STATUSES = new Set(['pendente', 'em_andamento', 'entregue', 'falhou', 'cancelado']);
// o relatório fica em /uploads (link público, nome aleatório): nunca página/script, que o navegador executaria
const DELIVERY_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.pptx', '.zip']);
const hashKey = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerJobRoutes(app, { pool, uploadRoot, publicUploadsUrl, getClientInsights, ensureSchema }) {
  const uploadsBase = (publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');

  async function verifyAgent(req) {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Agent ')) throw httpError(401, 'Unauthorized');
    const raw = header.slice('Agent '.length).trim();
    if (!raw) throw httpError(401, 'Unauthorized');
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT k.id, k.user_id, k.role, k.machine_id, p.name FROM agent_keys k LEFT JOIN profiles p ON p.id = k.user_id
        WHERE k.key_hash = $1 AND k.revoked_at IS NULL LIMIT 1`, [hashKey(raw)]
    ).catch((error) => {
      if (error.code === '42P01') return { rows: [] }; // agent_keys ainda não existe
      throw error;
    });
    if (!rows.length) throw httpError(401, 'Unauthorized');
    pool.query('UPDATE agent_keys SET last_used_at = now() WHERE id = $1', [rows[0].id]).catch(() => {});
    return { keyId: rows[0].id, userId: rows[0].user_id, role: rows[0].role, name: rows[0].name || 'Agente' };
  }

  const fail = (res, error) => {
    const status = error.status || 500;
    if (status >= 500) console.error('[agent-jobs]', error);
    res.status(status).json({ error: error.message || 'Erro' });
  };

  const JOB_SQL = `SELECT j.*, c.company_name, c.city AS client_city, c.is_admin_client FROM agent_jobs j LEFT JOIN clients c ON c.id = j.client_id`;
  const serialize = (j) => ({
    id: j.id,
    type: j.type,
    status: j.status,
    client: j.client_id ? { id: j.client_id, company_name: j.company_name || null, city: j.company_name ? clientCity({ city: j.client_city, is_admin_client: j.is_admin_client }) : null } : null,
    params: j.params || {},
    requested_by_name: j.requested_by_name || null,
    created_at: j.created_at,
    claimed_by_name: j.claimed_by_name || null,
    claimed_at: j.claimed_at || null,
    delivered_at: j.delivered_at || null,
    files: j.files || [],
    note: j.note || null,
    fail_reason: j.fail_reason || null,
  });
  async function loadJob(id) {
    if (!isUuid(id)) throw httpError(404, 'Pedido não encontrado');
    const { rows } = await pool.query(`${JOB_SQL} WHERE j.id = $1`, [id]);
    if (!rows.length) throw httpError(404, 'Pedido não encontrado');
    return rows[0];
  }

  // ── Avisos a quem pediu (pelo número do PULSE e no sino do sistema) ──
  async function notifyRequester(job, { body, mediaUrl, mediaName, title }) {
    const number = job.requested_by_number ? await getNumber(pool, job.requested_by_number) : null;
    if (number?.active) {
      await sendToNumber(pool, number, body, { mediaUrl, mediaName });
      await remember(pool, number.id, 'assistant', body);
    }
    if (job.requested_by_user) {
      await pool.query(`INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, 'assistente', '/configuracoes')`,
        [job.requested_by_user, title, clip(body, 300)]).catch(() => {});
    }
    return number;
  }

  async function notifyDelivered(job) {
    const client = await loadClient(pool, job.client_id);
    const month = job.params?.month;
    const label = `${client?.company_name || 'cliente'} de ${monthLabel(month)}`;
    const files = job.files || [];
    const pdf = files.find((f) => /\.pdf$/i.test(f.name || f.url)) || files[0];
    const number = job.requested_by_number ? await getNumber(pool, job.requested_by_number) : null;
    // envio ao cliente exige a permissão "enviar_cliente": sem ela, só avisa que está pronto
    const canSend = number?.active && client && (number.permissions || []).includes('enviar_cliente');
    if (canSend) {
      // a pergunta é uma ação esperando o "sim": no sim, o PDF vai para o grupo do cliente
      await proposeAction(pool, number, 'enviar_relatorio',
        { job_id: job.id, client_id: client.id, cliente: client.company_name, cidade: clientCity(client), mes: month }, { source: 'entrega' });
    }
    const body = `📊 Relatório de ${label} pronto${pdf ? ' (arquivo anexo)' : ''}.${canSend ? ' Envio no WhatsApp do cliente? (sim/não)' : ''}`
      + `${job.note ? `\nObservação do agente: ${clip(job.note, 300)}` : ''}`;
    await notifyRequester(job, {
      body, title: '📊 Relatório pronto', mediaUrl: pdf?.url, mediaName: pdf ? `Relatório ${client?.company_name || ''} ${monthLabel(month).replace('/', '-')}${path.extname(pdf.name || pdf.url || '.pdf') || '.pdf'}`.trim() : undefined,
    });
    await logEvent(pool, { numberId: number?.id || null, kind: 'relatorio_entregue', text: label, detail: { job_id: job.id, perguntou_envio: !!canSend } });
  }

  // ── Rotas ──
  app.get('/api/agent/jobs', async (req, res) => {
    try {
      await verifyAgent(req);
      const status = String(req.query.status || 'pendente');
      if (status !== 'todos' && !JOB_STATUSES.has(status)) throw httpError(400, 'status inválido');
      const { rows } = await pool.query(
        `${JOB_SQL} WHERE ($1 = 'todos' OR j.status = $1) ORDER BY j.created_at LIMIT 100`, [status]
      );
      res.json({ jobs: rows.map(serialize) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/agent/jobs/:id/claim', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const current = await loadJob(req.params.id);
      const { rowCount } = await pool.query(
        `UPDATE agent_jobs SET status = 'em_andamento', claimed_by = $2, claimed_by_name = $3, claimed_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'pendente'`, [current.id, agent.userId, agent.name]
      );
      const job = await loadJob(current.id);
      if (!rowCount) {
        return res.status(409).json({ error: job.status === 'em_andamento' ? `Pedido já pego por ${job.claimed_by_name || 'outro agente'}` : `Pedido não está pendente (${job.status})`, job: serialize(job) });
      }
      res.json({ job: serialize(job) });
    } catch (error) {
      fail(res, error);
    }
  });

  const deliverUpload = multer({
    storage: multer.diskStorage({
      destination(req, _file, cb) {
        try {
          fs.mkdirSync(req.jobUploadDir, { recursive: true });
          cb(null, req.jobUploadDir);
        } catch (error) {
          cb(error);
        }
      },
      filename(_req, file, cb) {
        const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
        cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
      },
    }),
    fileFilter(_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!DELIVERY_EXTENSIONS.has(ext)) return cb(Object.assign(new Error(`Tipo de arquivo não aceito (${ext || 'sem extensão'}): envie PDF, imagem, MP4, PPTX ou ZIP`), { status: 415 }));
      cb(null, true);
    },
    limits: { fileSize: 300 * 1024 * 1024, files: 10, fieldSize: 64 * 1024 },
  }).array('files', 10);

  app.post('/api/agent/jobs/:id/deliver', async (req, res) => {
    let agent;
    let job;
    try {
      agent = await verifyAgent(req);
      job = await loadJob(req.params.id);
      if (job.status !== 'em_andamento' || job.claimed_by !== agent.userId) {
        return res.status(409).json({ error: 'Pegue o pedido (claim) antes de entregar', job: serialize(job) });
      }
      req.jobUploadDir = path.resolve(uploadRoot, 'relatorios', job.client_id || 'sem-cliente', job.id);
      if (!req.jobUploadDir.startsWith(path.resolve(uploadRoot) + path.sep)) throw httpError(400, 'Pasta inválida');
    } catch (error) {
      return fail(res, error);
    }
    deliverUpload(req, res, async (uploadError) => {
      const cleanup = () => (req.files || []).forEach((f) => fs.promises.unlink(f.path).catch(() => {}));
      if (uploadError) {
        cleanup();
        return res.status(uploadError.status || (uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400)).json({ error: uploadError.message });
      }
      try {
        if (!req.files?.length) throw httpError(400, 'Envie ao menos um arquivo no campo "files"');
        const files = req.files.map((f) => {
          const relative = path.relative(path.resolve(uploadRoot), f.path).split(path.sep).join('/');
          return { url: `${uploadsBase}/${relative}`, name: clip(path.basename(f.originalname || f.filename), 160), size: f.size, mime: f.mimetype || null };
        });
        const note = clip(req.body?.note, 2000) || null;
        const { rowCount } = await pool.query(
          `UPDATE agent_jobs SET status = 'entregue', files = $2, note = $3, delivered_at = now(), updated_at = now()
            WHERE id = $1 AND status = 'em_andamento' AND claimed_by = $4`,
          [job.id, JSON.stringify(files), note, agent.userId]
        );
        if (!rowCount) {
          cleanup();
          return res.status(409).json({ error: 'O pedido mudou enquanto o arquivo subia' });
        }
        const delivered = await loadJob(job.id);
        await notifyDelivered(delivered).catch((error) => console.error('[agent-jobs] aviso da entrega:', error.message));
        res.json({ job: serialize(delivered) });
      } catch (error) {
        cleanup();
        fail(res, error);
      }
    });
  });

  app.post('/api/agent/jobs/:id/fail', async (req, res) => {
    try {
      const agent = await verifyAgent(req);
      const job = await loadJob(req.params.id);
      const reason = clip(req.body?.reason, 1000);
      if (!reason) throw httpError(400, 'Diga o motivo em "reason"');
      const { rowCount } = await pool.query(
        `UPDATE agent_jobs SET status = 'falhou', fail_reason = $2, failed_at = now(), updated_at = now(),
                claimed_by = COALESCE(claimed_by, $3), claimed_by_name = COALESCE(claimed_by_name, $4)
          WHERE id = $1 AND (status = 'pendente' OR (status = 'em_andamento' AND claimed_by = $3))`,
        [job.id, reason, agent.userId, agent.name]
      );
      if (!rowCount) return res.status(409).json({ error: `Pedido não pode falhar agora (${job.status})`, job: serialize(job) });
      const failed = await loadJob(job.id);
      const label = `${failed.company_name || 'cliente'} de ${monthLabel(failed.params?.month)}`;
      await notifyRequester(failed, { body: `⚠️ Não consegui gerar o relatório de ${label}.\nMotivo: ${reason}`, title: '⚠️ Relatório não gerado' })
        .catch((error) => console.error('[agent-jobs] aviso da falha:', error.message));
      await logEvent(pool, { numberId: failed.requested_by_number, kind: 'relatorio_falhou', text: label, detail: { job_id: failed.id, reason } });
      res.json({ job: serialize(failed) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/agent/clients/:id/report-data', async (req, res) => {
    try {
      await verifyAgent(req);
      const client = isUuid(req.params.id) ? (await pool.query(
        `SELECT c.id, c.company_name, c.city, c.is_admin_client, c.niche, c.responsible_person, c.logo_url, c.status, c.editorial,
                c.weekly_reels, c.weekly_creatives, c.weekly_stories, c.monthly_recordings, c.contract_start_date, p.name AS plan_name
           FROM clients c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = $1`, [req.params.id]
      )).rows[0] : null;
      if (!client) throw httpError(404, 'Cliente não encontrado');
      const month = String(req.query.month || brazilMonth());
      if (!isMonth(month)) throw httpError(400, 'month inválido (AAAA-MM)');
      res.json(await reportData(client, month));
    } catch (error) {
      fail(res, error);
    }
  });

  // ── Dados do relatório mensal (tabelas reais do sistema) ──
  async function reportData(client, month) {
    const { start, end } = monthRange(month);
    const endTs = `${end}T23:59:59.999-03:00`;
    const startTs = `${start}T00:00:00-03:00`;
    const q = (sql, params) => pool.query(sql, params).then((r) => r.rows).catch((error) => {
      console.error('[report-data]', error.message);
      return [];
    });
    const [approvedVideos, posted, socialDelivered, arts, recordings, deliveries, portalApproved, portalAdjust, portalPending,
      openContent, openDesign, upcoming, demands, account] = await Promise.all([
      q(`SELECT id, title, content_type, kanban_column, approved_at FROM content_tasks
          WHERE client_id = $1 AND approved_at BETWEEN $2 AND $3 ORDER BY approved_at`, [client.id, startTs, endTs]),
      q(`SELECT id, title, content_type, platform, status, COALESCE(posted_at, delivered_at) AS date FROM social_media_deliveries
          WHERE client_id = $1 AND lower(status) IN ('postado', 'posted', 'publicado')
            AND COALESCE(posted_at, delivered_at) BETWEEN $2::date AND $3::date ORDER BY 6`, [client.id, start, end]),
      q(`SELECT content_type, count(*)::int AS total FROM social_media_deliveries
          WHERE client_id = $1 AND delivered_at BETWEEN $2::date AND $3::date GROUP BY content_type`, [client.id, start, end]),
      q(`SELECT id, title, format_type, kanban_column, client_approved_at, updated_at FROM design_tasks
          WHERE client_id = $1 AND (client_approved_at BETWEEN $2 AND $3
            OR (kanban_column IN ('aprovado', 'postado') AND updated_at BETWEEN $2 AND $3))
          ORDER BY COALESCE(client_approved_at, updated_at)`, [client.id, startTs, endTs]),
      q(`SELECT r.id, r.date, r.start_time, r.status, r.type, p.name AS videomaker FROM recordings r LEFT JOIN profiles p ON p.id = r.videomaker_id
          WHERE r.client_id = $1 AND r.date BETWEEN $2::date AND $3::date ORDER BY r.date, r.start_time`, [client.id, start, end]),
      q(`SELECT COALESCE(sum(videos_recorded), 0)::int AS videos_gravados, COALESCE(sum(reels_produced), 0)::int AS reels,
                COALESCE(sum(creatives_produced), 0)::int AS criativos, COALESCE(sum(stories_produced), 0)::int AS stories,
                COALESCE(sum(arts_produced), 0)::int AS artes, COALESCE(sum(extras_produced), 0)::int AS extras, count(*)::int AS registros
           FROM delivery_records WHERE client_id = $1 AND date BETWEEN $2::date AND $3::date`, [client.id, start, end]),
      q(`SELECT id, title, content_type, approved_at FROM client_portal_contents
          WHERE client_id = $1 AND status = 'aprovado' AND approved_at BETWEEN $2 AND $3 ORDER BY approved_at`, [client.id, startTs, endTs]),
      q(`SELECT id, title, content_type, updated_at FROM client_portal_contents
          WHERE client_id = $1 AND status = 'ajuste_solicitado' AND updated_at BETWEEN $2 AND $3`, [client.id, startTs, endTs]),
      q(`SELECT id, title, content_type, created_at FROM client_portal_contents WHERE client_id = $1 AND status = 'pendente' ORDER BY created_at`, [client.id]),
      q(`SELECT id, title, content_type, kanban_column, updated_at FROM content_tasks
          WHERE client_id = $1 AND kanban_column NOT IN ('agendamentos', 'acompanhamento', 'postado', 'arquivado') ORDER BY updated_at DESC LIMIT 50`, [client.id]),
      q(`SELECT id, title, format_type, kanban_column, priority, due_date FROM design_tasks
          WHERE client_id = $1 AND kanban_column NOT IN ('aprovado', 'postado') ORDER BY updated_at DESC LIMIT 50`, [client.id]),
      q(`SELECT date, start_time, status, type FROM recordings WHERE client_id = $1 AND date >= $2::date AND status IS DISTINCT FROM 'cancelada'
          ORDER BY date, start_time LIMIT 8`, [client.id, brazilToday()]),
      q(`SELECT kind, summary, status, created_at FROM assistant_demands WHERE client_id = $1 AND created_at BETWEEN $2 AND $3 ORDER BY created_at`, [client.id, startTs, endTs]),
      q(`SELECT platform, username, account_name, status FROM social_accounts WHERE client_id = $1`, [client.id]),
    ]);

    // métricas do Instagram: a mesma busca da tela (cache de 12 h); sem conta ligada, o último retrato salvo do mês
    let instagram = null;
    const until = end > brazilToday() ? brazilToday() : end;
    if (typeof getClientInsights === 'function' && account.some((a) => a.platform === 'instagram' && a.status === 'connected')) {
      instagram = await getClientInsights(client.id, start, until, { maxAgeMinutes: 720 }).catch(() => null);
    }
    if (!instagram) {
      const [snapshot] = await q(
        `SELECT data, period_start, period_end, fetched_at FROM social_insights_snapshots
          WHERE client_id = $1 AND period_start <= $3::date AND period_end >= $2::date
          ORDER BY (period_start = $2::date AND period_end >= $3::date) DESC, fetched_at DESC LIMIT 1`, [client.id, start, end]
      );
      if (snapshot) instagram = { ...snapshot.data, periodo_do_retrato: { inicio: snapshot.period_start, fim: snapshot.period_end }, fetched_at: snapshot.fetched_at };
    }
    if (instagram) {
      // série e posts completos podem ser grandes: o agente recebe o resumo e os destaques
      const { posts, reach_series: reachSeries, follower_series: followerSeries, ...rest } = instagram;
      instagram = {
        ...rest,
        posts: Array.isArray(posts) ? posts.slice(0, 30) : [],
        reach_series: Array.isArray(reachSeries) ? reachSeries.slice(-62) : [],
        follower_series: Array.isArray(followerSeries) ? followerSeries.slice(-62) : [],
      };
    }

    const byStatus = {};
    for (const r of recordings) byStatus[r.status || 'sem_status'] = (byStatus[r.status || 'sem_status'] || 0) + 1;
    const goals = {
      reels_por_semana: Number(client.weekly_reels) || 0, criativos_por_semana: Number(client.weekly_creatives) || 0,
      stories_por_semana: Number(client.weekly_stories) || 0, gravacoes_por_mes: Number(client.monthly_recordings) || 0,
    };
    return {
      client: {
        id: client.id, company_name: client.company_name, city: clientCity(client), city_label: cityLabel(clientCity(client)),
        niche: client.niche || null, responsible_person: client.responsible_person || null, logo_url: client.logo_url || null,
        plan: client.plan_name || null, editorial: client.editorial || null, contract_start_date: client.contract_start_date || null,
        instagram: account.find((a) => a.platform === 'instagram')?.username || null, metas_do_plano: goals,
      },
      month, month_label: monthLabel(month), period: { start, end },
      generated_at: new Date().toISOString(),
      videos: {
        aprovados_pelo_cliente: approvedVideos.map((t) => ({ id: t.id, titulo: t.title, tipo: t.content_type, aprovado_em: t.approved_at, coluna: t.kanban_column })),
        postados: posted.map((p) => ({ id: p.id, titulo: p.title, tipo: p.content_type, plataforma: p.platform, data: p.date })),
        entregas_social_por_tipo: Object.fromEntries(socialDelivered.map((r) => [r.content_type || 'outro', r.total])),
      },
      artes: arts.map((a) => ({ id: a.id, titulo: a.title, formato: a.format_type, coluna: a.kanban_column, aprovada_em: a.client_approved_at })),
      gravacoes: {
        realizadas: recordings.filter((r) => r.status === 'concluida').map((r) => ({ data: r.date, hora: r.start_time, tipo: r.type, videomaker: r.videomaker })),
        por_status: byStatus,
        producao_registrada: deliveries[0] || null,
      },
      aprovacoes_portal: {
        aprovados: portalApproved.map((p) => ({ id: p.id, titulo: p.title, tipo: p.content_type, aprovado_em: p.approved_at })),
        ajustes_pedidos: portalAdjust.map((p) => ({ id: p.id, titulo: p.title, tipo: p.content_type, em: p.updated_at })),
      },
      instagram,
      demandas_do_grupo: demands.map((d) => ({ tipo: d.kind, resumo: d.summary, situacao: d.status, em: d.created_at })),
      pendencias: {
        esperando_aprovacao_no_portal: portalPending.map((p) => ({ id: p.id, titulo: p.title, tipo: p.content_type, desde: p.created_at })),
        conteudo_em_producao: openContent.map((t) => ({ id: t.id, titulo: t.title, tipo: t.content_type, coluna: t.kanban_column })),
        design_em_producao: openDesign.map((t) => ({ id: t.id, titulo: t.title, formato: t.format_type, coluna: t.kanban_column, prioridade: t.priority, prazo: t.due_date })),
        proximas_gravacoes: upcoming.map((r) => ({ data: r.date, hora: r.start_time, status: r.status, tipo: r.type })),
      },
      totais: {
        videos_aprovados: approvedVideos.length, postados: posted.length, artes: arts.length,
        gravacoes_realizadas: recordings.filter((r) => r.status === 'concluida').length, aprovacoes_portal: portalApproved.length,
      },
    };
  }

  return { notifyDelivered, reportData };
}

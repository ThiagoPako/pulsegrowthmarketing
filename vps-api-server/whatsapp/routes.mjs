// WhatsApp próprio — lado da API: rotas da tela de conexões, respostas recebidas e agendador diário.
//
// Rotas (admin):
//   GET    /api/whatsapp/connections            conexões, funções disponíveis, fila e se o processo está no ar
//   POST   /api/whatsapp/connections            { name, purposes[] } nova conexão (desligada até clicar em Conectar)
//   PATCH  /api/whatsapp/connections/:id        { name?, purposes? }
//   POST   /api/whatsapp/connections/:id/connect    { pair_phone? } liga: gera QR (ou código, se pair_phone)
//   POST   /api/whatsapp/connections/:id/disconnect desliga sem sair do WhatsApp (religa sem novo QR)
//   POST   /api/whatsapp/connections/:id/logout     sai do WhatsApp e apaga a sessão (precisa de novo QR)
//   DELETE /api/whatsapp/connections/:id            apaga a conexão (sai do WhatsApp)
//   POST   /api/whatsapp/connections/:id/test       { number, message } envia um teste por esta conexão
//   GET    /api/whatsapp/queue?status=&limit=        últimas mensagens da fila (diagnóstico)

import { WA_PURPOSES, ensureWhatsAppSchema, enqueueWhatsApp } from './shared.mjs';

const TZ = 'America/Sao_Paulo';

function brazilNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function registerWhatsAppRoutes(app, { pool, verifyAdmin, handleWhatsAppReply, runBillingAutomation, runConfirmationCron }) {
  ensureWhatsAppSchema(pool).catch((error) => console.error('[whatsapp] esquema:', error.message));

  const fail = (res, error) => {
    const status = error.status || (error.message === 'Admin access required' ? 403 : /Unauthorized|token/i.test(error.message) ? 401 : 500);
    if (status >= 500) console.error('[whatsapp]', error);
    res.status(status).json({ error: error.message });
  };
  const admin = async (req) => {
    const ctx = await verifyAdmin(req);
    await ensureWhatsAppSchema(pool);
    return ctx;
  };
  const cleanPurposes = (list) => {
    const out = [...new Set((Array.isArray(list) ? list : []).map(String))];
    const bad = out.filter((p) => !WA_PURPOSES[p]);
    if (bad.length) throw Object.assign(new Error(`Função desconhecida: ${bad.join(', ')}`), { status: 400 });
    return out;
  };
  const one = async (id) => {
    const { rows } = await pool.query('SELECT * FROM wa_connections WHERE id = $1', [id]);
    if (!rows.length) throw Object.assign(new Error('Conexão não encontrada'), { status: 404 });
    return rows[0];
  };
  const publicConn = (c) => ({
    id: c.id, name: c.name, purposes: c.purposes, desired: c.desired, status: c.status,
    qr_image: c.status === 'qr' ? c.qr_image : null, pairing_code: c.status === 'codigo' ? c.pairing_code : null,
    pair_phone: c.pair_phone, phone: c.phone, push_name: c.push_name, last_error: c.last_error,
    connected_at: c.connected_at, last_seen_at: c.last_seen_at, created_at: c.created_at, updated_at: c.updated_at,
  });

  app.get('/api/whatsapp/connections', async (req, res) => {
    try {
      await admin(req);
      const { rows } = await pool.query('SELECT * FROM wa_connections ORDER BY created_at');
      const { rows: queue } = await pool.query(
        `SELECT purpose,
                COUNT(*) FILTER (WHERE status IN ('fila', 'enviando')) AS waiting,
                COUNT(*) FILTER (WHERE status = 'enviada' AND sent_at > now() - interval '24 hours') AS sent_24h,
                COUNT(*) FILTER (WHERE status = 'falhou' AND created_at > now() - interval '24 hours') AS failed_24h
           FROM wa_outbox GROUP BY purpose`
      );
      const { rows: engine } = await pool.query(`SELECT seen_at FROM wa_engine WHERE id = 1`);
      const engineAlive = !!engine[0]?.seen_at && Date.now() - new Date(engine[0].seen_at).getTime() < 60_000;
      res.json({ connections: rows.map(publicConn), purposes: WA_PURPOSES, queue, engine_alive: engineAlive });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/whatsapp/connections', async (req, res) => {
    try {
      const { user } = await admin(req);
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Dê um nome à conexão (ex.: Aprovações)' });
      const purposes = cleanPurposes(req.body?.purposes);
      const { rows } = await pool.query(
        `INSERT INTO wa_connections (name, purposes, created_by) VALUES ($1, $2, $3) RETURNING *`,
        [name, purposes, user.id]
      );
      res.json({ connection: publicConn(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch('/api/whatsapp/connections/:id', async (req, res) => {
    try {
      await admin(req);
      const current = await one(req.params.id);
      const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 60) : current.name;
      if (!name) return res.status(400).json({ error: 'Nome vazio' });
      const purposes = req.body?.purposes !== undefined ? cleanPurposes(req.body.purposes) : current.purposes;
      const { rows } = await pool.query(
        `UPDATE wa_connections SET name = $2, purposes = $3, updated_at = now() WHERE id = $1 RETURNING *`,
        [current.id, name, purposes]
      );
      res.json({ connection: publicConn(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/whatsapp/connections/:id/connect', async (req, res) => {
    try {
      await admin(req);
      const current = await one(req.params.id);
      const pairPhone = String(req.body?.pair_phone || '').replace(/\D/g, '') || null;
      if (pairPhone && pairPhone.length < 12) {
        return res.status(400).json({ error: 'Número com DDI e DDD, ex.: 5562999998888' });
      }
      const { rows } = await pool.query(
        `UPDATE wa_connections SET desired = 'ligada', command = 'reconectar', pair_phone = $2, status = 'conectando',
                last_error = NULL, qr = NULL, qr_image = NULL, pairing_code = NULL, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [current.id, pairPhone]
      );
      res.json({ connection: publicConn(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/whatsapp/connections/:id/disconnect', async (req, res) => {
    try {
      await admin(req);
      const current = await one(req.params.id);
      await pool.query(`UPDATE wa_connections SET desired = 'desligada', updated_at = now() WHERE id = $1`, [current.id]);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/whatsapp/connections/:id/logout', async (req, res) => {
    try {
      await admin(req);
      const current = await one(req.params.id);
      await pool.query(`UPDATE wa_connections SET command = 'sair', desired = 'desligada', updated_at = now() WHERE id = $1`, [current.id]);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });

  app.delete('/api/whatsapp/connections/:id', async (req, res) => {
    try {
      await admin(req);
      const current = await one(req.params.id);
      // o processo do WhatsApp vê que a conexão sumiu, sai do WhatsApp e apaga a sessão
      await pool.query('DELETE FROM wa_connections WHERE id = $1', [current.id]);
      await pool.query(`UPDATE wa_outbox SET connection_id = NULL WHERE connection_id = $1 AND status = 'fila'`, [current.id]);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post('/api/whatsapp/connections/:id/test', async (req, res) => {
    try {
      const { user } = await admin(req);
      const current = await one(req.params.id);
      const number = String(req.body?.number || '').trim();
      if (!number) return res.status(400).json({ error: 'Informe o número de teste' });
      const message = String(req.body?.message || `Teste da conexão "${current.name}" do sistema Pulse ✅`).slice(0, 2000);
      const queued = await enqueueWhatsApp(pool, {
        to: number, body: message, triggerType: 'teste', purpose: current.purposes[0] || 'geral', sentBy: user.id, connectionId: current.id,
      });
      res.json({ ok: true, id: queued.id });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/whatsapp/queue', async (req, res) => {
    try {
      await admin(req);
      const limit = Math.min(200, Number(req.query.limit) || 50);
      const status = req.query.status ? String(req.query.status) : null;
      const { rows } = await pool.query(
        `SELECT o.id, o.purpose, o.to_number, o.status, o.attempts, o.error, o.trigger_type, o.created_at, o.sent_at,
                left(o.body, 160) AS preview, c.name AS connection_name
           FROM wa_outbox o LEFT JOIN wa_connections c ON c.id = o.connection_id
          WHERE ($1::text IS NULL OR o.status = $1)
          ORDER BY o.created_at DESC LIMIT $2`,
        [status, limit]
      );
      res.json({ items: rows });
    } catch (error) {
      fail(res, error);
    }
  });

  // ── Respostas recebidas (ex.: 1/2 da confirmação de gravação) ──
  let handling = false;
  setInterval(async () => {
    if (handling) return;
    handling = true;
    try {
      await ensureWhatsAppSchema(pool);
      const { rows } = await pool.query(
        `UPDATE wa_inbound SET handled_at = now()
          WHERE id IN (SELECT id FROM wa_inbound WHERE handled_at IS NULL ORDER BY received_at LIMIT 20)
          RETURNING id, phone, text`
      );
      for (const row of rows) {
        let result;
        try {
          result = row.phone ? await handleWhatsAppReply(row.phone, row.text) : { skipped: 'sem_telefone' };
        } catch (error) {
          result = { error: error.message };
        }
        await pool.query('UPDATE wa_inbound SET result = $2 WHERE id = $1', [row.id, JSON.stringify(result).slice(0, 500)]);
      }
    } catch (error) {
      console.error('[whatsapp] respostas:', error.message);
    } finally {
      handling = false;
    }
  }, 4000);

  // ── Agendador diário (horário de Brasília; nunca de noite) ──
  const JOBS = [
    { job: 'cobranca', fromHour: 9, run: runBillingAutomation },
    { job: 'confirmacao_gravacao', fromHour: 10, run: runConfirmationCron },
  ];
  setInterval(async () => {
    try {
      await ensureWhatsAppSchema(pool);
      const { day, hour } = brazilNow();
      for (const { job, fromHour, run } of JOBS) {
        if (hour < fromHour || hour >= 20) continue;
        const { rows } = await pool.query(
          `INSERT INTO wa_job_runs (job, day) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING job`, [job, day]
        );
        if (!rows.length) continue; // já rodou hoje
        try {
          const result = await run();
          await pool.query(`UPDATE wa_job_runs SET result = $3::jsonb WHERE job = $1 AND day = $2`, [job, day, JSON.stringify(result ?? {})]);
          console.log(`[whatsapp] ${job} ${day}:`, JSON.stringify(result).slice(0, 300));
        } catch (error) {
          await pool.query(`UPDATE wa_job_runs SET result = $3::jsonb WHERE job = $1 AND day = $2`,
            [job, day, JSON.stringify({ error: error.message })]);
          console.error(`[whatsapp] ${job}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[whatsapp] agendador:', error.message);
    }
  }, 5 * 60 * 1000);
}

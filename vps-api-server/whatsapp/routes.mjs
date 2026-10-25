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
//   GET    /api/whatsapp/config      (qualquer usuário) chave geral, automações e modelos de mensagem
//   PATCH  /api/whatsapp/config      (admin, social media, gestor de projetos) { integration_active, auto_*, msg_* }
//          A configuração é uma só para as duas cidades: é a mesma linha que o servidor usa nos envios.
//   GET    /api/whatsapp/groups      (gestão) grupos em que os números conectados estão — para o cadastro do cliente
//
// Fluxos automáticos (laços abaixo):
//   - vídeo novo no portal (status "pendente") → UMA mensagem ao cliente (no grupo dele) com o link do portal;
//     conteúdos que entram juntos (ex.: pacote de stories) vão na mesma mensagem.
//   - no grupo, "não consegui entrar/abrir…" → o(s) vídeo(s) pendente(s) vão no privado de quem escreveu, que
//     aprova respondendo APROVADO ou pede ajuste escrevendo o que mudar (mesmo efeito do portal).

import { WA_PURPOSES, ensureWhatsAppSchema, enqueueWhatsApp, clientTarget, clientsForGroup } from './shared.mjs';

const TZ = 'America/Sao_Paulo';

function brazilNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function registerWhatsAppRoutes(app, { pool, verifyAdmin, verifyUser, verifyTeamManager, handleWhatsAppReply, runBillingAutomation, runConfirmationCron }) {
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

  // ── Configuração (uma só, para as duas cidades) ──
  // O servidor sempre leu a primeira linha de whatsapp_config; a tela filtrava por cidade e, em Uruaçu (sem linha
  // própria), não achava nada. Agora a tela lê e grava exatamente a linha que o servidor usa.
  const configRow = async () => {
    const { rows } = await pool.query('SELECT * FROM whatsapp_config LIMIT 1');
    if (rows.length) return rows[0];
    const { rows: created } = await pool.query('INSERT INTO whatsapp_config DEFAULT VALUES RETURNING *');
    return created[0];
  };
  let configColumns = null;
  const editableColumns = async () => {
    if (!configColumns) {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'whatsapp_config'`
      );
      configColumns = new Set(rows.map((r) => r.column_name)
        .filter((c) => c === 'integration_active' || c.startsWith('auto_') || c.startsWith('msg_')));
    }
    return configColumns;
  };
  const strip = (row) => {
    const { api_token, default_user_id, default_queue_id, send_signature, close_ticket, api_token_configured, ...rest } = row;
    return rest;
  };

  app.get('/api/whatsapp/config', async (req, res) => {
    try {
      await verifyUser(req);
      res.json({ config: strip(await configRow()) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.patch('/api/whatsapp/config', async (req, res) => {
    try {
      await verifyTeamManager(req);
      const allowed = await editableColumns();
      const entries = Object.entries(req.body || {}).filter(([k]) => allowed.has(k));
      if (!entries.length) return res.status(400).json({ error: 'Nada para salvar' });
      const current = await configRow();
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      const { rows } = await pool.query(
        `UPDATE whatsapp_config SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
        [current.id, ...entries.map(([, v]) => v)]
      );
      res.json({ config: strip(rows[0]) });
    } catch (error) {
      fail(res, error);
    }
  });


  // ── Vídeo novo no portal → uma mensagem ao cliente ──
  const PORTAL_URL = 'https://agenciapulse.tech/portal';
  const UPLOADS_ORIGIN = 'https://agenciapulse.tech';
  const firstName = (c) => (c?.responsible_person || c?.company_name || '').trim().split(/\s+/)[0] || '';
  const listTitles = (titles) => (titles.length === 1 ? `"${titles[0]}"`
    : `${titles.slice(0, -1).map((t) => `"${t}"`).join(', ')} e "${titles[titles.length - 1]}"`);
  const fill = (tpl, vars) => Object.entries(vars).reduce((t, [k, v]) => t.replace(new RegExp(`\\{${k}\\}`, 'g'), v ?? ''), tpl || '');
  const HELP_HINT = 'Se não conseguir abrir o link, é só avisar aqui que mandamos o vídeo no seu privado.';

  async function notifyNewPortalContent() {
    // na primeira vez: o que já estava no portal antes deste aviso existir não gera mensagem
    const { rows: first } = await pool.query(
      `INSERT INTO wa_job_runs (job, day) VALUES ('portal_aviso_inicio', '2000-01-01') ON CONFLICT DO NOTHING RETURNING job`
    );
    if (first.length) {
      await pool.query(`UPDATE client_portal_contents SET wa_notified_at = now() WHERE wa_notified_at IS NULL`);
      return;
    }
    // espera 90 s sem novidade do cliente para juntar o que entrou junto numa mensagem só
    const { rows: batches } = await pool.query(
      `SELECT client_id, array_agg(id ORDER BY created_at) AS ids, array_agg(title ORDER BY created_at) AS titles
         FROM client_portal_contents
        WHERE status = 'pendente' AND wa_notified_at IS NULL AND client_id IS NOT NULL
        GROUP BY client_id
       HAVING max(COALESCE(updated_at, created_at)) < now() - interval '90 seconds'`
    );
    if (!batches.length) return;
    const { rows: [config] } = await pool.query('SELECT * FROM whatsapp_config LIMIT 1');
    for (const batch of batches) {
      await pool.query('UPDATE client_portal_contents SET wa_notified_at = now() WHERE id = ANY($1)', [batch.ids]);
      if (!config?.integration_active || !config?.auto_video_approval) continue;
      const { rows: [client] } = await pool.query(
        'SELECT id, company_name, responsible_person, whatsapp, whatsapp_group FROM clients WHERE id = $1', [batch.client_id]
      );
      const to = clientTarget(client, 'aprovacao');
      if (!to) continue;
      const portal = `${PORTAL_URL}/${client.id}`;
      const titles = batch.titles.map((t) => String(t || 'Conteúdo').trim());
      let message;
      if (titles.length === 1 && config.msg_video_approval && /\{link_(portal|video)\}/.test(config.msg_video_approval)) {
        message = fill(config.msg_video_approval, { nome_cliente: client.company_name, titulo: titles[0], link_portal: portal, link_video: portal });
      } else {
        message = titles.length === 1
          ? `Olá, ${firstName(client)}! 😊\n\nSeu conteúdo ${listTitles(titles)} ficou pronto! 🎬\n\n📱 Assista e aprove na sua Área do Cliente:\n${portal}`
          : `Olá, ${firstName(client)}! 😊\n\n${titles.length} conteúdos novos chegaram no seu portal:\n${titles.map((t) => `• ${t}`).join('\n')}\n\n📱 Assista e aprove na sua Área do Cliente:\n${portal}`;
      }
      if (!message.includes(HELP_HINT)) message += `\n\n${HELP_HINT}`;
      await enqueueWhatsApp(pool, { to, body: message, clientId: client.id, triggerType: 'auto_video_approval', purpose: 'aprovacao' });
    }
  }

  // ── Feriado: avisa quem tem gravação no dia (Configurações → Feriados → "Envio automático (2 dias antes)") ──
  // Feriado "Anual" vale todo ano no mesmo dia e mês. Cada ocorrência avisa uma vez (holidays.last_notified_date,
  // que o "Avisar" manual também grava). Olha amanhã e depois de amanhã: se o agendador não rodou num dia, ainda avisa.
  const HOLIDAY_DEFAULT_MSG = 'Olá, {nome_cliente}! 🚀\n\nInformamos que no dia *{data_feriado}* ({nome_feriado}) *não haverá gravações*.\n\nNossa equipe retorna normalmente no próximo dia útil.\n\n📱 Acompanhe tudo na sua Área do Cliente:\n{link_portal}\n\nEquipe Pulse Growth Marketing';
  const isoDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10));
  const addDays = (day, n) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const holidayOccursOn = (h, day) => {
    const base = isoDay(h.date);
    if (!h.recurring) return base === day;
    if (base.slice(5) === day.slice(5)) return true;
    return base.slice(5) === '02-29' && day.slice(5) === '02-28' && !isLeapYear(Number(day.slice(0, 4))); // 29/02 cai em 28/02
  };
  const holidayLabel = (day) => {
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
    return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)} (${weekday})`;
  };

  async function runHolidayNotifications() {
    const { rows: [config] } = await pool.query('SELECT * FROM whatsapp_config LIMIT 1');
    if (!config?.integration_active || config?.auto_holiday_notification !== true) return { skipped: 'desligado' };
    const { day } = brazilNow();
    const targets = [addDays(day, 1), addDays(day, 2)];
    const { rows: holidays } = await pool.query('SELECT * FROM holidays');
    const result = { feriados: 0, enviados: 0 };
    for (const h of holidays) {
      const occurrence = targets.find((t) => holidayOccursOn(h, t));
      if (!occurrence) continue;
      if (isoDay(h.last_notified_date) === occurrence || (!h.recurring && h.notification_sent)) continue;
      // marca antes de enviar: um reinício no meio não manda duas vezes
      const { rows: claimed } = await pool.query(
        `UPDATE holidays SET last_notified_date = $2, notification_sent = true
          WHERE id = $1 AND last_notified_date IS DISTINCT FROM $2::date RETURNING id`, [h.id, occurrence]
      );
      if (!claimed.length) continue;
      result.feriados++;
      const { rows: clients } = await pool.query(
        `SELECT DISTINCT c.id, c.company_name, c.responsible_person, c.whatsapp, c.whatsapp_group
           FROM recordings r JOIN clients c ON c.id::text = r.client_id::text
          WHERE r.date = $1 AND r.status = 'agendada'`, [occurrence]
      );
      for (const client of clients) {
        const to = clientTarget(client, 'agenda');
        if (!to) continue;
        const body = fill(config.msg_holiday || HOLIDAY_DEFAULT_MSG, {
          nome_cliente: client.company_name, data_feriado: holidayLabel(occurrence), nome_feriado: h.name || 'feriado',
          link_portal: `${PORTAL_URL}/${client.id}`,
        });
        await enqueueWhatsApp(pool, { to, body, clientId: client.id, triggerType: 'auto_holiday', purpose: 'agenda',
          expiresAt: new Date(`${occurrence}T00:00:00-03:00`) });
        result.enviados++;
      }
    }
    return result;
  }

  // ── Aprovar / pedir ajuste (o mesmo que o portal faz) ──
  async function notifyTeam(title, message, type, link) {
    const { rows } = await pool.query(`SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin', 'social_media')`);
    for (const u of rows) {
      await pool.query('INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)',
        [u.user_id, title, message, type, link]).catch(() => {});
    }
  }

  // Só age em conteúdo ainda "pendente": se o cliente já aprovou ou pediu ajuste pelo portal (ou a equipe mexeu),
  // uma mensagem atrasada no WhatsApp não muda nada. Devolve false nesse caso.
  async function approveContent(contentId, who) {
    const { rows: [content] } = await pool.query(
      `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'pendente'
       RETURNING id, client_id, title`, [contentId]
    );
    if (!content) return false;
    await pool.query(`INSERT INTO client_portal_comments (content_id, author_name, author_type, message) VALUES ($1, $2, 'client', $3)`,
      [content.id, who || 'Cliente', '✅ Aprovado pelo WhatsApp']).catch(() => {});
    const { rows: [task] } = await pool.query(
      `SELECT id FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column IN ('envio', 'revisao', 'agendamentos')
        ORDER BY created_at DESC LIMIT 1`, [content.client_id, content.title]
    );
    if (task) {
      await pool.query(`UPDATE content_tasks SET kanban_column = 'agendamentos', approved_at = NOW(), updated_at = NOW() WHERE id = $1`, [task.id]);
      await pool.query('INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, NULL)',
        [task.id, '✅ Aprovado pelo cliente via WhatsApp', who || null]);
    }
    await notifyTeam('✅ Conteúdo aprovado pelo cliente', `"${content.title}" foi aprovado pelo WhatsApp`, 'approval', '/conteudo');
    return true;
  }

  async function requestAdjustment(contentId, note, who) {
    const { rows: [content] } = await pool.query(
      `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW() WHERE id = $1 AND status = 'pendente'
       RETURNING id, client_id, title`,
      [contentId]
    );
    if (!content) return false;
    await pool.query(`INSERT INTO client_portal_comments (content_id, author_name, author_type, message) VALUES ($1, $2, 'client', $3)`,
      [content.id, who || 'Cliente', `🔧 Ajuste solicitado (WhatsApp): ${note}`]).catch(() => {});
    // card já aprovado (agendamentos) não volta para alteração por mensagem do WhatsApp
    const { rows: [task] } = await pool.query(
      `SELECT id, assigned_to FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column IN ('envio', 'revisao')
        ORDER BY created_at DESC LIMIT 1`, [content.client_id, content.title]
    );
    if (task) {
      await pool.query(`UPDATE content_tasks SET kanban_column = 'alteracao', adjustment_notes = $1, updated_at = NOW() WHERE id = $2`, [note, task.id]);
      await pool.query('INSERT INTO task_history (task_id, action, details, user_id) VALUES ($1, $2, $3, NULL)',
        [task.id, '🔧 Ajuste solicitado pelo cliente via WhatsApp', note]);
      if (task.assigned_to) {
        await pool.query('INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)',
          [task.assigned_to, '🔧 Ajuste solicitado pelo cliente', `"${content.title}" precisa de ajustes: ${note.slice(0, 80)}`, 'adjustment', '/edicao/kanban']).catch(() => {});
      }
    }
    await notifyTeam('🔧 Ajuste solicitado pelo WhatsApp', `Cliente pediu ajuste em "${content.title}": ${note.slice(0, 80)}`, 'adjustment', '/entregas-social');
    return true;
  }

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const CANT_OPEN = /\b(nao|n|nem)\s+(consegui|consigo|to conseguindo|estou conseguindo|tou conseguindo)\s+(entrar|acessar|abrir|ver|assistir|logar|baixar|aprovar)|\bnao\s+(abre|abriu|carrega|carregou|funciona|funcionou|ta abrindo|esta abrindo|aparece|apareceu|entra|entrou)\b|\b(link|portal|site|video|area do cliente)\s+(nao|n)\s+(abre|abriu|funciona|funcionou|carrega|entra|aparece)|\b(erro|problema)\s+(no|com o|ao abrir o|pra abrir o|para abrir o)\s+(link|portal|site)/;
  // aprova: "aprovado…", "pode postar…", ou um "ok/sim/👍" sozinho (um "ok, vou ver" não aprova)
  const APPROVE = /^(aprovad[oa]s?|aprovo|aprovei|aprova|pode postar|pode publicar|pode subir|ta aprovado|esta aprovado|tudo certo|ficou otimo|ficou perfeito)\b/;
  const APPROVE_ALONE = /^(ok|okay|sim|show|top|perfeito|amei|otimo|👍|✅|👏)[!. 👍✅👏]*$/;
  // "aprovado, mas troca a música" não é só aprovação
  const NOT_ONLY_APPROVAL = /\b(nao|mas|porem|so que|exceto|menos|antes)\b|\b(troc|mud|ajust|corrig|alter|tir[ae]|remov)\w*/;
  // aprovação de um item: "1 aprovado", "o 2 tá ok"
  const ITEM_APPROVE = /^(?:ta |esta |ficou |foi )?(?:aprovad[oa]s?|aprovo|aprova|ok|okay|pode postar|pode publicar|perfeito|otimo|show|top|tudo certo|certo|sim)(?![a-z0-9])/;
  // o lote inteiro: "os dois aprovados", "todos ok", "ambos podem postar" (só vale se a quantidade é a do lote)
  const ALL_APPROVE = /^(?:(todos|todas|ambos|ambas)(?:\s+(?:os|as))?(?:\s+(\d{1,2}|dois|duas|tres))?|(?:os|as)\s+(\d{1,2}|dois|duas|tres))\s+(?:(?:videos?|artes?)\s+)?(?:(?:foram|estao|tao|ta|ficaram)\s+)?(?:aprovad[oa]s?|ok|okay|perfeitos?|otimos?|podem? postar|podem? publicar)(?![a-z0-9])/;
  const COUNT_WORDS = { dois: 2, duas: 2, tres: 3 };
  const approvesAll = (n, total) => {
    const m = n.match(ALL_APPROVE);
    if (!m) return false;
    const num = m[2] || m[3];
    return (num ? COUNT_WORDS[num] || Number(num) : /^amb/.test(m[1]) ? 2 : total) === total;
  };
  // "o 2 também", "o 3 idem": a mesma resposta do trecho anterior
  const SAME_AS = /^(?:tambem|tb|tbm|idem|igual|mesma coisa|o mesmo|a mesma coisa)[!. ]*$/;
  // pedido de mudança claro (com um vídeo só, vira ajuste sem precisar do número)
  const CHANGE_REQUEST = /\b(ajust|troc|mud|tir[ae]|corrig|alter|coloc|bot[ae]|aument|diminu|abaix|remov|substitu|acrescent|adicion|refaz|cort[ae]|errad|faltou|falta)\w*|\berro\b/;
  // cortesia / "vou ver depois": não é aprovação nem ajuste
  const COURTESY = /^(?:obrigad[oa]|obg|valeu|vlw|bom dia|boa tarde|boa noite|oi|ola|opa|blz|beleza|recebi|recebido|vou ver|vou assistir|vou olhar|depois vejo|depois eu vejo|ja vejo|ja vou ver|assisto|kk+|ha(?:ha)+|rs+)(?![a-z0-9])/;
  // "o 1 tá aprovado, o 2 troca a música" → um trecho por vídeo ("1 ok 2 ok", sem vírgula, também separa)
  const SEGMENT_SPLIT = /(?:\s*[\n;,]+\s*|\s+e\s+|(?<=(?:^|[\s.!])(?:aprovad[oa]s?|ok|okay|sim|perfeito|[oó]timo|show|top|certo)[!.]*)\s+)(?=(?:(?:o|a|no|na)\s+)?(?:v[ií]deo\s+|arte\s+)?\d{1,2}(?!\d))/i;
  const SEGMENT = /^(?:(?:o|a|no|na)\s+)?(?:v[ií]deo\s+|arte\s+)?(\d{1,2})(?!\d)\s*(?:[-:.)º°]\s*)?(.*)$/is;
  const phoneVariants = (phone) => {
    const d = String(phone || '').replace(/\D/g, '');
    const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
    const set = new Set([local]);
    if (local.length === 11 && local[2] === '9') set.add(local.slice(0, 2) + local.slice(3));
    if (local.length === 10) set.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    return [...set].flatMap((v) => [v, `55${v}`]);
  };

  // no grupo: "não consegui abrir" → vídeos pendentes no privado de quem escreveu
  async function handleGroupHelp({ groupJid, phone, pushName, text }) {
    if (!CANT_OPEN.test(norm(text))) return { skipped: 'nao_e_pedido_de_ajuda' };
    const [client] = await clientsForGroup(pool, groupJid);
    if (!client) return { skipped: 'grupo_sem_cliente' };
    const { rows: recent } = await pool.query(
      `SELECT 1 FROM wa_approval_requests WHERE client_id = $1 AND status = 'pendente' AND created_at > now() - interval '2 hours' LIMIT 1`,
      [client.id]
    );
    if (recent.length) return { skipped: 'ja_mandado_ha_pouco' };
    const { rows: contents } = await pool.query(
      `SELECT id, title, file_url, content_type FROM client_portal_contents
        WHERE client_id = $1 AND status = 'pendente' AND file_url IS NOT NULL AND file_url <> ''
        ORDER BY created_at DESC LIMIT 5`, [client.id]
    );
    const name = (pushName || firstName(client) || '').split(/\s+/)[0];
    if (!contents.length) {
      await enqueueWhatsApp(pool, { to: groupJid, body: `Oi${name ? `, ${name}` : ''}! No momento não tem vídeo esperando sua aprovação no portal. 😊`,
        clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
      return { ok: true, sem_videos: true };
    }
    const target = String(phone || client.whatsapp || '').replace(/\D/g, '');
    if (!target) return { skipped: 'sem_numero' };
    contents.reverse(); // do mais antigo para o mais novo
    const batch = (await pool.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    // arte vai como imagem (sem forçar ".mp4"); link de fora (ex.: Drive) vai no texto, não como anexo
    const isArt = (c) => c.content_type === 'arte' || /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(c.file_url);
    const allVideos = contents.every((c) => !isArt(c));
    for (let i = 0; i < contents.length; i++) {
      const c = contents[i];
      await pool.query(
        `INSERT INTO wa_approval_requests (batch_id, position, client_id, content_id, title, phone) VALUES ($1, $2, $3, $4, $5, $6)`,
        [batch, i + 1, client.id, c.id, c.title, target]
      );
      const url = c.file_url.startsWith('/') ? `${UPLOADS_ORIGIN}${c.file_url}` : c.file_url;
      const ownFile = url.startsWith(`${UPLOADS_ORIGIN}/`);
      const art = isArt(c);
      const label = art ? `🎨 Arte` : `🎬 Vídeo`;
      const caption = contents.length > 1 ? `${label} ${i + 1} de ${contents.length}: ${c.title}` : `${art ? '🎨' : '🎬'} ${c.title}`;
      const hasVideoExt = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url);
      await enqueueWhatsApp(pool, ownFile
        ? { to: target, body: caption, mediaUrl: url, mediaName: art || hasVideoExt ? undefined : `${c.title}.mp4`,
            clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' }
        : { to: target, body: `${caption}\n${url}`, clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    }
    const how = contents.length > 1
      ? `Para aprovar todos, responda *APROVADO*.\nPara pedir ajuste, escreva o número do ${allVideos ? 'vídeo' : 'conteúdo'} e o que mudar (ex.: *2 trocar a música*).`
      : `Para aprovar, responda *APROVADO*.\nSe quiser algum ajuste, escreva *AJUSTE* e o que mudar (ex.: *AJUSTE trocar a música*).`;
    const what = allVideos ? (contents.length > 1 ? 'os vídeos' : 'o vídeo') : (contents.length > 1 ? 'os conteúdos' : 'o conteúdo');
    await enqueueWhatsApp(pool, { to: target, body: `Oi${name ? `, ${name}` : ''}! Como o portal não abriu, mandei ${what} aqui. 😊\n\n${how}`,
      clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    await enqueueWhatsApp(pool, { to: groupJid, body: `${name ? `${name}, m` : 'M'}andei ${what} no seu privado para você ${allVideos ? 'assistir' : 'ver'} e aprovar por lá 👍`,
      clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    return { ok: true, enviados: contents.length };
  }

  // no privado: resposta aos vídeos mandados (APROVADO ou o ajuste)
  // Só vale intenção clara: "APROVADO" (a frase inteira) aprova tudo; "2 trocar a música" ou "AJUSTE trocar a música"
  // pedem ajuste; "1 aprovado, 2 trocar a música" vale item a item. Cortesia ("obrigado", "vou assistir") não faz nada,
  // e o resto recebe UMA explicação de como responder (sem virar ajuste nem aprovar).
  async function handlePrivateApproval({ phone, pushName, text }) {
    const { rows: pending } = await pool.query(
      `SELECT r.*, c.status AS content_status
         FROM wa_approval_requests r LEFT JOIN client_portal_contents c ON c.id = r.content_id
        WHERE r.phone = ANY($1) AND r.status = 'pendente' AND r.created_at > now() - interval '7 days'
        ORDER BY r.created_at DESC, r.position`, [phoneVariants(phone)]
    );
    // aprovado ou com ajuste pedido pelo portal (ou mexido pela equipe): o pedido pelo WhatsApp acabou
    const closed = pending.filter((p) => p.content_status !== 'pendente');
    if (closed.length) {
      await pool.query(`UPDATE wa_approval_requests SET status = 'encerrado', answered_at = now() WHERE id = ANY($1)`, [closed.map((p) => p.id)]);
    }
    const open = pending.filter((p) => p.content_status === 'pendente');
    if (!open.length) return { skipped: 'sem_aprovacao_pendente' };
    const latestBatch = open[0].batch_id;
    const items = open.filter((p) => p.batch_id === latestBatch).sort((a, b) => a.position - b.position);
    const who = pushName || 'Cliente';
    const reply = (message) => enqueueWhatsApp(pool, { to: items[0].phone, body: message, clientId: items[0].client_id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    const raw = String(text || '').trim();
    const explicitAdjust = raw.match(/^ajust(?:e|ar)\b[\s:,.-]*(.*)$/is);
    const body = explicitAdjust ? explicitAdjust[1].trim() : raw;
    const n = norm(body);

    const approveItem = async (item) => {
      const ok = await approveContent(item.content_id, who);
      await pool.query(`UPDATE wa_approval_requests SET status = $3, answer = $2, answered_at = now() WHERE id = $1`,
        [item.id, raw.slice(0, 500), ok ? 'aprovado' : 'encerrado']);
      return ok;
    };
    const adjustItem = async (item, note) => {
      const ok = await requestAdjustment(item.content_id, note, who);
      await pool.query(`UPDATE wa_approval_requests SET status = $3, answer = $2, answered_at = now() WHERE id = $1`,
        [item.id, note.slice(0, 500), ok ? 'ajuste' : 'encerrado']);
      return ok;
    };
    const respond = async (approved, adjusted) => {
      const parts = [];
      if (approved.length) {
        parts.push(approved.length === items.length
          ? `Aprovado ✅ Obrigado! Vamos seguir com a publicação${items.length > 1 ? ' dos vídeos' : ''}. 🚀`
          : `Aprovado ✅ ${listTitles(approved.map((i) => i.title || 'Conteúdo'))}.`);
      }
      if (adjusted.length) {
        parts.push(`Anotado! ✍️ Vamos fazer o ajuste em ${listTitles(adjusted.map((i) => i.title || 'Conteúdo'))} e te mandamos de novo.`);
      }
      if (parts.length) await reply(parts.join('\n\n'));
      return { ok: true, aprovados: approved.length, ajustes: adjusted.map((i) => i.content_id) };
    };
    // explica uma vez só por lote (não responde a cada mensagem da semana)
    const askOnce = async (message) => {
      const { rowCount } = await pool.query(
        `UPDATE wa_approval_requests SET help_sent_at = now() WHERE batch_id = $1 AND status = 'pendente' AND help_sent_at IS NULL`, [latestBatch]
      );
      if (!rowCount) return { skipped: 'ajuda_ja_enviada' };
      await reply(message);
      return { ok: true, perguntou: true };
    };

    // 1) aprovar tudo: a frase é a aprovação ("aprovado, mas troca a música" não é)
    if (!explicitAdjust && (APPROVE.test(n) || APPROVE_ALONE.test(n) || approvesAll(n, items.length)) && !NOT_ONLY_APPROVAL.test(n)) {
      const approved = [];
      for (const item of items) if (await approveItem(item)) approved.push(item);
      return respond(approved, []);
    }

    // 2) por número: "2 trocar a música", "o 1 tá aprovado, o 2 troca a música", "1 e 2 aprovados", "o 1 ok, o 2 também"
    const segments = body.split(SEGMENT_SPLIT).map((s) => s.trim())
      .filter((s) => s && (SEGMENT.test(s) || !COURTESY.test(norm(s)))); // "bom dia, o 2 trocar…": ignora o "bom dia"
    const parsed = segments.map((segment) => {
      const m = segment.match(SEGMENT);
      const item = m ? items.find((i) => i.position === Number(m[1])) : null;
      const note = m ? m[2].trim() : '';
      if (!item) return null;
      const ns = norm(note).replace(/^(?:tambem|tb|tbm)\s+(?=\S)/, ''); // "o 2 também tá ok"
      if (!ns) return { item, follows: 'next' }; // "1 e 2 aprovados": o "1" segue o trecho seguinte
      if (SAME_AS.test(ns)) return { item, follows: 'previous' };
      if (ITEM_APPROVE.test(ns) && !NOT_ONLY_APPROVAL.test(ns)) return { item, approve: true };
      // ajuste só com pedido de mudança claro (ou depois de "AJUSTE"): "o 2 ficou lindo" não abre ajuste
      return ns.length >= 3 && (explicitAdjust || CHANGE_REQUEST.test(ns)) ? { item, note } : null;
    });
    // "também" repete a resposta do trecho anterior; o número sozinho, a do seguinte (sem ela, cai na explicação)
    const inherit = (p, from) => (from && !from.follows ? { ...from, item: p.item } : null);
    parsed.forEach((p, i) => { if (p?.follows === 'previous') parsed[i] = inherit(p, parsed[i - 1]); });
    for (let i = parsed.length - 1; i >= 0; i--) if (parsed[i]?.follows === 'next') parsed[i] = inherit(parsed[i], parsed[i + 1]);
    if (segments.length && parsed.every(Boolean)) {
      const approved = [];
      const adjusted = [];
      for (const p of parsed) {
        if (p.approve) {
          if (await approveItem(p.item)) approved.push(p.item);
        } else if (await adjustItem(p.item, p.note)) adjusted.push(p.item);
      }
      return respond(approved, adjusted);
    }

    // 3) um vídeo só: "AJUSTE …" ou um pedido de mudança claro vira ajuste
    if (items.length === 1 && n.length >= 3 && (explicitAdjust || CHANGE_REQUEST.test(n))) {
      const ok = await adjustItem(items[0], body);
      return respond([], ok ? [items[0]] : []);
    }

    // 4) cortesia ou texto solto
    if (!explicitAdjust && (COURTESY.test(n) || n.length < 3)) return { skipped: 'nao_e_resposta' };
    if (items.length > 1) {
      return askOnce(`Qual vídeo? Responda com o número e o ajuste, por exemplo: *${items.length} trocar a música*.\nPara aprovar todos, responda *APROVADO*.`);
    }
    return askOnce(`Não entendi se é um ajuste 🙂\nPara aprovar, responda *APROVADO*.\nPara pedir ajuste, escreva *AJUSTE* e o que mudar (ex.: *AJUSTE trocar a música*).`);
  }

  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      await verifyTeamManager(req);
      await ensureWhatsAppSchema(pool);
      const { rows } = await pool.query(
        `SELECT g.jid, max(g.subject) AS subject, max(g.size) AS size, array_agg(DISTINCT c.name) AS connections
           FROM wa_groups g JOIN wa_connections c ON c.id = g.connection_id
          GROUP BY g.jid ORDER BY lower(max(g.subject))`
      );
      res.json({ groups: rows });
    } catch (error) {
      fail(res, error);
    }
  });

  // ── Respostas recebidas (ex.: 1/2 da confirmação de gravação) ──
  const INBOUND_MAX_ATTEMPTS = 3;
  let handling = false;
  setInterval(async () => {
    if (handling) return;
    handling = true;
    try {
      await ensureWhatsAppSchema(pool);
      // reserva o lote (claimed_at) e só marca handled_at depois de tratar cada mensagem: um restart ou uma falha
      // do banco no meio não perde o "1" do cliente. Reservada há 5 min sem conclusão volta a ser tratada (até 3 vezes).
      const { rows } = await pool.query(
        `UPDATE wa_inbound SET claimed_at = now(), attempts = attempts + 1
          WHERE id IN (SELECT id FROM wa_inbound
                        WHERE handled_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
                        ORDER BY received_at LIMIT 20)
          RETURNING id, phone, text, group_jid, push_name, attempts`
      );
      for (const row of rows) {
        let result;
        let failed = false;
        try {
          const msg = { groupJid: row.group_jid, phone: row.phone, pushName: row.push_name, text: row.text };
          // 1º confirmação de gravação (1/2); senão, no grupo: pedido de ajuda; no privado: aprovação de vídeo
          result = await handleWhatsAppReply(row.phone, row.text, { groupJid: row.group_jid });
          if (result?.skipped) {
            result = row.group_jid ? await handleGroupHelp(msg) : row.phone ? await handlePrivateApproval(msg) : { skipped: 'sem_telefone' };
          }
        } catch (error) {
          failed = true;
          result = { error: error.message, tentativa: row.attempts };
        }
        const done = !failed || row.attempts >= INBOUND_MAX_ATTEMPTS;
        await pool.query(
          `UPDATE wa_inbound SET result = $2${done ? ', handled_at = now()' : ''} WHERE id = $1`,
          [row.id, JSON.stringify(result).slice(0, 500)]
        );
      }
    } catch (error) {
      console.error('[whatsapp] respostas:', error.message);
    } finally {
      handling = false;
    }
  }, 4000);

  let notifying = false;
  setInterval(async () => {
    if (notifying) return;
    notifying = true;
    try {
      await ensureWhatsAppSchema(pool);
      await notifyNewPortalContent();
    } catch (error) {
      console.error('[whatsapp] aviso do portal:', error.message);
    } finally {
      notifying = false;
    }
  }, 30_000);

  // ── Agendador diário (horário de Brasília; nunca de noite) ──
  const JOBS = [
    { job: 'cobranca', fromHour: 9, run: runBillingAutomation },
    { job: 'confirmacao_gravacao', fromHour: 10, run: runConfirmationCron },
    { job: 'aviso_feriado', fromHour: 9, run: runHolidayNotifications },
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

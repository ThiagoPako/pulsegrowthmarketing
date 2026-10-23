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

  // ── Aprovar / pedir ajuste (o mesmo que o portal faz) ──
  async function notifyTeam(title, message, type, link) {
    const { rows } = await pool.query(`SELECT DISTINCT user_id FROM user_roles WHERE role IN ('admin', 'social_media')`);
    for (const u of rows) {
      await pool.query('INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)',
        [u.user_id, title, message, type, link]).catch(() => {});
    }
  }

  async function approveContent(contentId, who) {
    const { rows: [content] } = await pool.query(
      `UPDATE client_portal_contents SET status = 'aprovado', approved_at = NOW(), updated_at = NOW() WHERE id = $1
       RETURNING id, client_id, title`, [contentId]
    );
    if (!content) return;
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
  }

  async function requestAdjustment(contentId, note, who) {
    const { rows: [content] } = await pool.query(
      `UPDATE client_portal_contents SET status = 'ajuste_solicitado', updated_at = NOW() WHERE id = $1 RETURNING id, client_id, title`,
      [contentId]
    );
    if (!content) return;
    await pool.query(`INSERT INTO client_portal_comments (content_id, author_name, author_type, message) VALUES ($1, $2, 'client', $3)`,
      [content.id, who || 'Cliente', `🔧 Ajuste solicitado (WhatsApp): ${note}`]).catch(() => {});
    const { rows: [task] } = await pool.query(
      `SELECT id, assigned_to FROM content_tasks WHERE client_id = $1 AND title = $2 AND kanban_column IN ('envio', 'revisao', 'agendamentos')
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
  }

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const CANT_OPEN = /\b(nao|n|nem)\s+(consegui|consigo|to conseguindo|estou conseguindo|tou conseguindo)\s+(entrar|acessar|abrir|ver|assistir|logar|baixar|aprovar)|\bnao\s+(abre|abriu|carrega|carregou|funciona|funcionou|ta abrindo|esta abrindo|aparece|apareceu|entra|entrou)\b|\b(link|portal|site|video|area do cliente)\s+(nao|n)\s+(abre|abriu|funciona|funcionou|carrega|entra|aparece)|\b(erro|problema)\s+(no|com o|ao abrir o|pra abrir o|para abrir o)\s+(link|portal|site)/;
  // aprova: "aprovado…", "pode postar…", ou um "ok/sim/👍" sozinho (um "ok, vou ver" não aprova)
  const APPROVE = /^(aprovad[oa]s?|aprovo|aprovei|aprova|pode postar|pode publicar|pode subir|ta aprovado|esta aprovado|tudo certo|ficou otimo|ficou perfeito)\b/;
  const APPROVE_ALONE = /^(ok|okay|sim|show|top|perfeito|amei|otimo|👍|✅|👏)[!. 👍✅👏]*$/;
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
      `SELECT id, title, file_url FROM client_portal_contents
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
    for (let i = 0; i < contents.length; i++) {
      const c = contents[i];
      await pool.query(
        `INSERT INTO wa_approval_requests (batch_id, position, client_id, content_id, title, phone) VALUES ($1, $2, $3, $4, $5, $6)`,
        [batch, i + 1, client.id, c.id, c.title, target]
      );
      const url = c.file_url.startsWith('/') ? `${UPLOADS_ORIGIN}${c.file_url}` : c.file_url;
      const caption = contents.length > 1 ? `🎬 Vídeo ${i + 1} de ${contents.length}: ${c.title}` : `🎬 ${c.title}`;
      await enqueueWhatsApp(pool, { to: target, body: caption, mediaUrl: url, mediaName: `${c.title}.mp4`,
        clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    }
    const how = contents.length > 1
      ? `Para aprovar todos, responda *APROVADO*.\nPara pedir ajuste, escreva o número do vídeo e o que mudar (ex.: *2 trocar a música*).`
      : `Para aprovar, responda *APROVADO*.\nSe quiser algum ajuste, é só escrever aqui o que mudar.`;
    await enqueueWhatsApp(pool, { to: target, body: `Oi${name ? `, ${name}` : ''}! Como o portal não abriu, mandei ${contents.length > 1 ? 'os vídeos' : 'o vídeo'} aqui. 😊\n\n${how}`,
      clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    await enqueueWhatsApp(pool, { to: groupJid, body: `${name ? `${name}, m` : 'M'}andei ${contents.length > 1 ? 'os vídeos' : 'o vídeo'} no seu privado para você assistir e aprovar por lá 👍`,
      clientId: client.id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    return { ok: true, enviados: contents.length };
  }

  // no privado: resposta aos vídeos mandados (APROVADO ou o ajuste)
  async function handlePrivateApproval({ phone, pushName, text }) {
    const { rows: pending } = await pool.query(
      `SELECT * FROM wa_approval_requests WHERE phone = ANY($1) AND status = 'pendente' AND created_at > now() - interval '7 days'
        ORDER BY created_at DESC, position`, [phoneVariants(phone)]
    );
    if (!pending.length) return { skipped: 'sem_aprovacao_pendente' };
    const latestBatch = pending[0].batch_id;
    const items = pending.filter((p) => p.batch_id === latestBatch).sort((a, b) => a.position - b.position);
    const n = norm(text);
    const who = pushName || 'Cliente';
    const reply = (body) => enqueueWhatsApp(pool, { to: items[0].phone, body, clientId: items[0].client_id, triggerType: 'portal_ajuda', purpose: 'aprovacao' });
    if (APPROVE.test(n) || APPROVE_ALONE.test(n) || (/aprovad/.test(n) && !/\bnao\b/.test(n))) {
      for (const item of items) {
        await approveContent(item.content_id, who);
        await pool.query(`UPDATE wa_approval_requests SET status = 'aprovado', answer = $2, answered_at = now() WHERE id = $1`, [item.id, text.slice(0, 500)]);
      }
      await reply(`Aprovado ✅ Obrigado! Vamos seguir com a publicação${items.length > 1 ? ' dos vídeos' : ''}. 🚀`);
      return { ok: true, aprovados: items.length };
    }
    if (n.length < 3) return { skipped: 'resposta_curta' };
    let item = items.length === 1 ? items[0] : null;
    let note = text.trim();
    const numbered = text.trim().match(/^(\d{1,2})\s*[-:.)]?\s+(.+)$/s);
    if (!item && numbered) {
      item = items.find((i) => i.position === Number(numbered[1])) || null;
      note = numbered[2].trim();
    }
    if (!item) {
      await reply(`Qual vídeo? Responda com o número e o ajuste, por exemplo: *${items.length} trocar a música*.`);
      return { ok: true, perguntou_qual: true };
    }
    await requestAdjustment(item.content_id, note, who);
    await pool.query(`UPDATE wa_approval_requests SET status = 'ajuste', answer = $2, answered_at = now() WHERE id = $1`, [item.id, note.slice(0, 500)]);
    await reply(`Anotado! ✍️ Vamos fazer o ajuste em "${item.title}" e te mandamos de novo.`);
    return { ok: true, ajuste: item.content_id };
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
  let handling = false;
  setInterval(async () => {
    if (handling) return;
    handling = true;
    try {
      await ensureWhatsAppSchema(pool);
      const { rows } = await pool.query(
        `UPDATE wa_inbound SET handled_at = now()
          WHERE id IN (SELECT id FROM wa_inbound WHERE handled_at IS NULL ORDER BY received_at LIMIT 20)
          RETURNING id, phone, text, group_jid, push_name`
      );
      for (const row of rows) {
        let result;
        try {
          const msg = { groupJid: row.group_jid, phone: row.phone, pushName: row.push_name, text: row.text };
          // 1º confirmação de gravação (1/2); senão, no grupo: pedido de ajuda; no privado: aprovação de vídeo
          result = await handleWhatsAppReply(row.phone, row.text, { groupJid: row.group_jid });
          if (result?.skipped) {
            result = row.group_jid ? await handleGroupHelp(msg) : row.phone ? await handlePrivateApproval(msg) : { skipped: 'sem_telefone' };
          }
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

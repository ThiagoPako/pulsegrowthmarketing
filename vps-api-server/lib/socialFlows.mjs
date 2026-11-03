// ─── Funis no direct, estilo ManyChat (usuário, 02/11/2026) ─────────────────────────────────────────────────────────
// "Eu quero aqueles botões que aparecem no direct… colocar link nesses botões, criar funil com esses botões lá no
// direct. Um negócio bem completo, igual o ManyChat." Tudo pela Upload-Post (lib/uploadPost.mjs) e pelo aviso em tempo
// real dela (comment_received e dm_received, lib/socialHub.mjs).
//
// Funil = gatilho + etapas. Gatilhos: palavra no comentário (de um post ou de qualquer post) ou palavra no direct.
// Cada etapa manda uma mensagem e pode ter:
//   • botões de link (até 3, abrem o site, o WhatsApp, a loja);
//   • respostas rápidas (até 13): botões que levam para outra etapa do funil;
//   • pergunta: espera a pessoa responder e guarda no contato (nome, telefone, e-mail ou texto livre), depois segue;
//   • etiqueta no contato, "seguir direto" para a próxima etapa, e "passar para a equipe" (pausa o robô 24 h e avisa).
// Comentário: a 1ª mensagem vai como resposta privada ao comentário (o Instagram só deixa uma por comentário e só com
// botões de link); as respostas rápidas aparecem na mensagem seguinte, quando a pessoa responder. Opcional: uma
// resposta pública no comentário ("Te mandei no direct! 💌").
// Só para seguidores (usuário, 02/11/2026: "um botão para ativar a função de apenas para seguidores e caso a pessoa
// não estiver seguindo ela recebe uma mensagem amigável falando pra seguir que libera para ela o link ou presente"):
// com trigger.followers_only, o comentário recebe primeiro o pedido para seguir (trigger.follow_message) e o funil só
// começa quando a pessoa responde "JÁ SIGO" (ou toca no botão). A Upload-Post não diz se a pessoa segue o perfil; o
// isFollower (opcional) entra quando houver acesso direto à Meta (is_user_follow_business). Sem ele, vale a palavra.
// Contatos: cada pessoa que conversa vira um contato do cliente, com etiquetas, campos e a conversa guardada. A equipe
// pode "assumir a conversa" (o robô pausa) e responder pela caixa de direct.

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
// sem acento, minúsculo e sem pontuação: "Eu quero!!" = "eu quero"
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@#]+/g, ' ').trim();
const FIELD_CHECK = {
  telefone: (v) => (String(v).replace(/\D/g, '').length >= 10 ? String(v).replace(/\D/g, '') : null),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? String(v).trim().toLowerCase() : null),
  nome: (v) => (String(v).trim().length >= 2 ? clean(v, 80) : null),
  texto: (v) => (String(v).trim() ? clean(v, 500) : null),
};
export const FOLLOW_DEFAULT = 'Oi, {primeiro_nome}! 😊 Esse presente é só para quem segue a gente. Segue o perfil e me responde JÁ SIGO aqui que eu te mando na hora 💛';
export const FOLLOW_CONFIRM = 'Já sigo ✅';
const FOLLOW_STEP = '__seguir';
const FOLLOW_NOT_YET = 'Ainda não te achei entre os seguidores 🥺 Segue o perfil e toca em "Já sigo" de novo que eu libero pra você!';
const FOLLOW_REMINDER = 'Pra liberar, é só seguir o perfil e tocar em "Já sigo" 👇';
/** A pessoa disse que já segue? ("já sigo", "segui", "pronto", "to seguindo"…) */
export const saysFollows = (text) => /(^| )(sigo|segui|seguindo|pronto|feito)( |$)/.test(norm(text));
export const FIELD_RETRY = {
  telefone: 'Não entendi o número 🙈 Pode mandar com DDD? Ex.: 62 99999-9999',
  email: 'Esse e-mail não parece certo. Pode mandar de novo? 🙏',
  nome: 'Pode me dizer seu nome? 😊',
  texto: 'Pode me responder por escrito? 😊',
};

/** Valida o funil vindo do editor. */
export function normalizeFlow(body) {
  const fail = (m) => { throw Object.assign(new Error(m), { status: 400 }); };
  const name = clean(body?.name, 80) || fail('Dê um nome ao funil');
  const type = ['comment_keyword', 'dm_keyword'].includes(body?.trigger?.type) ? body.trigger.type : fail('Escolha o gatilho');
  const keywords = (Array.isArray(body?.trigger?.keywords) ? body.trigger.keywords : String(body?.trigger?.keywords || '').split(','))
    .map((k) => clean(k, 40)).filter(Boolean).slice(0, 15);
  if (type === 'dm_keyword' && !keywords.length) fail('No gatilho do direct, coloque pelo menos uma palavra');
  const postIds = (Array.isArray(body?.trigger?.post_ids) ? body.trigger.post_ids : []).map((p) => clean(p, 80)).filter(Boolean).slice(0, 20);
  const raw = Array.isArray(body?.steps) ? body.steps : [];
  if (!raw.length) fail('Crie pelo menos uma mensagem');
  if (raw.length > 30) fail('No máximo 30 etapas por funil');
  const ids = new Set(raw.map((s) => clean(s?.id, 40)));
  const steps = raw.map((s, i) => {
    const id = clean(s?.id, 40) || fail(`Etapa ${i + 1} sem id`);
    const text = clean(s?.text, 1000) || fail(`Etapa ${i + 1}: escreva a mensagem`);
    const buttons = (Array.isArray(s?.buttons) ? s.buttons : []).map((b) => ({ title: clean(b?.title, 20), url: clean(b?.url, 500) }))
      .filter((b) => b.title && /^https?:\/\//.test(b.url)).slice(0, 3);
    const replies = (Array.isArray(s?.replies) ? s.replies : []).map((r) => ({ title: clean(r?.title, 20), next: clean(r?.next, 40) }))
      .filter((r) => r.title).slice(0, 13);
    for (const r of replies) if (r.next && !ids.has(r.next)) fail(`Etapa ${i + 1}: o botão "${r.title}" leva para uma etapa que não existe`);
    const ask = s?.ask && FIELD_CHECK[s.ask.field] ? { field: s.ask.field, next: clean(s.ask.next, 40) || null } : null;
    if (ask?.next && !ids.has(ask.next)) fail(`Etapa ${i + 1}: a pergunta segue para uma etapa que não existe`);
    const next = clean(s?.next, 40) || null;
    if (next && !ids.has(next)) fail(`Etapa ${i + 1}: "seguir para" aponta para uma etapa que não existe`);
    if (ask && replies.length) fail(`Etapa ${i + 1}: use pergunta ou botões de resposta, não os dois`);
    return {
      id, text, image_url: /^https:\/\//.test(String(s?.image_url || '')) ? clean(s.image_url, 500) : null, buttons, replies, ask,
      next: replies.length || ask ? null : next, tag: clean(s?.tag, 40) || null, handoff: !!s?.handoff,
    };
  });
  return {
    name, active: body?.active !== false,
    trigger: {
      type, keywords, post_ids: postIds,
      ...(type === 'comment_keyword' && body?.trigger?.followers_only
        ? { followers_only: true, follow_message: clean(body.trigger.follow_message, 1000) || FOLLOW_DEFAULT }
        : {}),
    },
    public_reply: type === 'comment_keyword' ? clean(body?.public_reply, 300) || null : null,
    steps,
  };
}

/** O comentário ou a mensagem dispara o funil? Sem palavras = qualquer comentário (só no gatilho de comentário). */
export function matchesTrigger(flow, text, postId) {
  const t = flow.trigger || {};
  if (t.type === 'comment_keyword' && t.post_ids?.length && !t.post_ids.includes(String(postId))) return false;
  if (!t.keywords?.length) return t.type === 'comment_keyword';
  const n = norm(text);
  return t.keywords.some((k) => {
    const kk = norm(k);
    return kk && (n === kk || ` ${n} `.includes(` ${kk} `));
  });
}

/** {nome} e {primeiro_nome} na mensagem. */
export function fillVars(text, contact) {
  const name = contact?.fields?.nome || contact?.username || '';
  return String(text || '').replace(/\{nome\}/g, name).replace(/\{primeiro_nome\}/g, String(name).split(/\s+/)[0] || '').replace(/\s{2,}/g, ' ').trim();
}

export function createFlows({ pool, uploadPost, notifyTeam = async () => {}, isFollower = async () => null, logger = console }) {
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = pool.query(`
        CREATE TABLE IF NOT EXISTS social_flows (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL,
          name TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT true,
          trigger JSONB NOT NULL,
          public_reply TEXT,
          steps JSONB NOT NULL,
          runs INT NOT NULL DEFAULT 0,
          clicks JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS social_contacts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL,
          platform TEXT NOT NULL DEFAULT 'instagram',
          ext_id TEXT NOT NULL,
          username TEXT,
          tags TEXT[] NOT NULL DEFAULT '{}',
          fields JSONB NOT NULL DEFAULT '{}'::jsonb,
          flow_id UUID,
          step_id TEXT,
          awaiting TEXT,
          paused_until TIMESTAMPTZ,
          last_in_at TIMESTAMPTZ,
          last_message TEXT,
          unread INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (client_id, platform, ext_id)
        );
        CREATE TABLE IF NOT EXISTS social_dm_messages (
          id BIGSERIAL PRIMARY KEY,
          contact_id UUID NOT NULL,
          direction TEXT NOT NULL,
          text TEXT,
          meta JSONB,
          by_name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS social_dm_messages_contact ON social_dm_messages (contact_id, created_at);
      `).catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }

  async function clientByProfile(profile) {
    const { rows: [cp] } = await pool.query(`SELECT client_id, username FROM client_upload_post WHERE username = $1`, [profile]);
    return cp || null;
  }
  async function profileOf(clientId) {
    const { rows: [p] } = await pool.query(`SELECT username FROM client_upload_post WHERE client_id = $1`, [clientId]);
    if (!p) throw Object.assign(new Error('Cliente sem redes conectadas pela Upload-Post'), { status: 409 });
    return p.username;
  }

  async function upsertContact(clientId, platform, extId, username) {
    const { rows: [c] } = await pool.query(
      `INSERT INTO social_contacts (client_id, platform, ext_id, username) VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, platform, ext_id) DO UPDATE SET username = coalesce(EXCLUDED.username, social_contacts.username)
       RETURNING *`, [clientId, platform, String(extId), username || null]
    );
    return c;
  }

  async function log(contactId, direction, text, meta = null, byName = null) {
    await pool.query(`INSERT INTO social_dm_messages (contact_id, direction, text, meta, by_name) VALUES ($1, $2, $3, $4, $5)`,
      [contactId, direction, text ? String(text).slice(0, 2000) : null, meta ? JSON.stringify(meta) : null, byName]);
  }

  const payloadOf = (flowId, stepId) => `f:${flowId}:${stepId}`;
  async function dmFollowButton(profile, contact, flowId, message) {
    await uploadPost.call('POST', '/uploadposts/dms/send', {
      json: { platform: 'instagram', user: profile, recipient_id: contact.ext_id, message, quick_replies: [{ title: FOLLOW_CONFIRM, payload: payloadOf(flowId, FOLLOW_STEP) }] },
    });
    await log(contact.id, 'out', message, { flow_id: flowId, step_id: FOLLOW_STEP, replies: [FOLLOW_CONFIRM] }, 'Automação');
  }
  const replyLine = (step) => (step.replies?.length ? `\n\nResponda: ${step.replies.map((r) => r.title).join(' · ')}` : '');

  /** Manda uma etapa (e as seguintes encadeadas por "seguir direto", até 5). */
  async function sendStep({ profile, contact, flow, step, viaComment = null, depth = 0 }) {
    const text = fillVars(step.text, contact);
    const quick = (step.replies || []).filter((r) => r.next).map((r) => ({ title: r.title, payload: payloadOf(flow.id, r.next) }));
    if (viaComment) {
      // 1ª mensagem do comentário: resposta privada (só texto + botões de link); as respostas rápidas viram texto
      await uploadPost.call('POST', '/uploadposts/comments/reply', {
        json: { platform: 'instagram', user: profile, comment_id: viaComment, message: `${text}${replyLine(step)}`, ...(step.buttons?.length ? { buttons: step.buttons } : {}) },
      });
    } else {
      if (step.image_url) {
        await uploadPost.call('POST', '/uploadposts/dms/send', { json: { platform: 'instagram', user: profile, recipient_id: contact.ext_id, message: ' ', attachment: { type: 'image', url: step.image_url } } }).catch(() => {});
      }
      await uploadPost.call('POST', '/uploadposts/dms/send', {
        json: {
          platform: 'instagram', user: profile, recipient_id: contact.ext_id, message: text,
          ...(step.buttons?.length ? { buttons: step.buttons } : {}), ...(quick.length ? { quick_replies: quick } : {}),
        },
      });
    }
    await log(contact.id, 'out', text, { flow_id: flow.id, step_id: step.id, buttons: step.buttons, replies: step.replies?.map((r) => r.title) }, 'Automação');
    const tags = step.tag ? [...new Set([...(contact.tags || []), step.tag])] : contact.tags || [];
    await pool.query(
      `UPDATE social_contacts SET flow_id = $2, step_id = $3, awaiting = $4, tags = $5, paused_until = CASE WHEN $6 THEN now() + interval '24 hours' ELSE paused_until END WHERE id = $1`,
      [contact.id, flow.id, step.id, step.ask ? step.ask.field : null, tags, !!step.handoff]
    );
    if (step.handoff) {
      const { rows: [cl] } = await pool.query(`SELECT company_name FROM clients WHERE id = $1`, [contact.client_id]);
      await notifyTeam('📩 Direct pede a equipe', `${cl?.company_name || 'Cliente'} · @${contact.username || contact.ext_id} no funil "${flow.name}". Responda pela Central Social → Direct.`).catch(() => {});
    }
    if (step.next && depth < 5 && !viaComment) {
      const nxt = flow.steps.find((s) => s.id === step.next);
      if (nxt) await sendStep({ profile, contact: { ...contact, tags, flow_id: flow.id }, flow, step: nxt, depth: depth + 1 });
    }
  }

  async function activeFlows(clientId, type) {
    await ensureSchema();
    const { rows } = await pool.query(`SELECT * FROM social_flows WHERE client_id = $1 AND active AND trigger->>'type' = $2 ORDER BY created_at`, [clientId, type]);
    return rows;
  }

  /** Comentário no Instagram (aviso em tempo real): dispara o funil. Devolve o nome do funil quando respondeu. */
  async function handleComment(payload) {
    if (payload?.platform !== 'instagram' || !payload.comment?.id) return null;
    const cp = await clientByProfile(payload.profile_username);
    if (!cp) return null;
    const from = payload.comment.from || {};
    if (from.username && cp.username && norm(from.username) === norm(cp.username)) return null;
    const flow = (await activeFlows(cp.client_id, 'comment_keyword')).find((f) => matchesTrigger(f, payload.comment.text, payload.post?.id));
    if (!flow || !from.id) return null;
    const contact = await upsertContact(cp.client_id, 'instagram', from.id, from.username);
    await log(contact.id, 'in', payload.comment.text, { comment_id: payload.comment.id, post_id: payload.post?.id });
    if (flow.trigger?.followers_only) {
      // só para seguidores: primeiro o pedido para seguir; o funil começa quando a pessoa responder "JÁ SIGO"
      const text = fillVars(flow.trigger.follow_message || FOLLOW_DEFAULT, contact);
      await uploadPost.call('POST', '/uploadposts/comments/reply', {
        json: { platform: 'instagram', user: payload.profile_username, comment_id: payload.comment.id, message: text },
      });
      await log(contact.id, 'out', text, { flow_id: flow.id, step_id: FOLLOW_STEP }, 'Automação');
      await pool.query(`UPDATE social_contacts SET flow_id = $2, step_id = $3, awaiting = NULL WHERE id = $1`, [contact.id, flow.id, FOLLOW_STEP]);
    } else {
      await sendStep({ profile: payload.profile_username, contact, flow, step: flow.steps[0], viaComment: payload.comment.id });
    }
    if (flow.public_reply) {
      await uploadPost.call('POST', '/uploadposts/comments/public-reply', {
        json: { platform: 'instagram', user: payload.profile_username, comment_id: payload.comment.id, message: flow.public_reply },
      }).catch((error) => logger.warn?.('[funis] resposta pública:', error.message));
    }
    await pool.query(`UPDATE social_flows SET runs = runs + 1 WHERE id = $1`, [flow.id]);
    return flow.name;
  }

  /** Mensagem no direct (aviso em tempo real). */
  async function handleDm(payload) {
    if (payload?.platform !== 'instagram' || !payload.sender?.id) return false;
    const cp = await clientByProfile(payload.profile_username);
    if (!cp) return false;
    await ensureSchema();
    let contact = await upsertContact(cp.client_id, 'instagram', payload.sender.id, payload.sender.username);
    const text = payload.message?.text || '';
    await log(contact.id, 'in', text || '(anexo)', { quick_reply_payload: payload.message?.quick_reply_payload || null, attachments: payload.message?.attachments?.length || 0 });
    await pool.query(`UPDATE social_contacts SET last_in_at = now(), last_message = $2, unread = unread + 1 WHERE id = $1`, [contact.id, (text || '(anexo)').slice(0, 200)]);
    contact = { ...contact, last_in_at: new Date() };
    if (contact.paused_until && new Date(contact.paused_until) > new Date()) return true; // a equipe assumiu

    const go = async (flowId, stepId) => {
      const { rows: [flow] } = await pool.query(`SELECT * FROM social_flows WHERE id = $1 AND client_id = $2`, [flowId, cp.client_id]);
      const step = flow?.steps?.find((s) => s.id === stepId);
      if (!flow || !step) return false;
      const clicks = { ...(flow.clicks || {}) };
      clicks[stepId] = (clicks[stepId] || 0) + 1;
      await pool.query(`UPDATE social_flows SET clicks = $2 WHERE id = $1`, [flow.id, JSON.stringify(clicks)]);
      await sendStep({ profile: payload.profile_username, contact, flow, step });
      return true;
    };

    const qp = String(payload.message?.quick_reply_payload || '');
    // 0) só para seguidores: esperando o "JÁ SIGO" (escrito ou no botão)
    if (contact.flow_id && String(contact.step_id || '').startsWith(FOLLOW_STEP)) {
      const { rows: [flow] } = await pool.query(`SELECT * FROM social_flows WHERE id = $1 AND client_id = $2`, [contact.flow_id, cp.client_id]);
      const tapped = qp === `f:${contact.flow_id}:${FOLLOW_STEP}`;
      if (flow?.steps?.length && (tapped || saysFollows(text))) {
        const follows = await isFollower({ profile: payload.profile_username, contact }).catch(() => null);
        if (follows === false) {
          await dmFollowButton(payload.profile_username, contact, flow.id, FOLLOW_NOT_YET);
          return true;
        }
        return go(flow.id, flow.steps[0].id);
      }
      if (flow?.steps?.length && contact.step_id === FOLLOW_STEP) {
        // 1ª resposta que não é "já sigo": lembra uma vez, com o botão; depois deixa a conversa seguir normal
        await dmFollowButton(payload.profile_username, contact, flow.id, FOLLOW_REMINDER);
        await pool.query(`UPDATE social_contacts SET step_id = $2 WHERE id = $1`, [contact.id, `${FOLLOW_STEP}2`]);
        return true;
      }
    }
    // 1) botão de resposta rápida
    if (qp.startsWith('f:')) {
      const [, flowId, stepId] = qp.split(':');
      if (await go(flowId, stepId)) return true;
    }
    // 2) pergunta esperando resposta
    if (contact.awaiting && contact.flow_id) {
      const value = FIELD_CHECK[contact.awaiting]?.(text);
      const { rows: [flow] } = await pool.query(`SELECT * FROM social_flows WHERE id = $1`, [contact.flow_id]);
      const step = flow?.steps?.find((s) => s.id === contact.step_id);
      if (!value) {
        await uploadPost.call('POST', '/uploadposts/dms/send', { json: { platform: 'instagram', user: payload.profile_username, recipient_id: contact.ext_id, message: FIELD_RETRY[contact.awaiting] } });
        await log(contact.id, 'out', FIELD_RETRY[contact.awaiting], null, 'Automação');
        return true;
      }
      const fields = { ...(contact.fields || {}), [contact.awaiting]: value };
      await pool.query(`UPDATE social_contacts SET fields = $2, awaiting = NULL WHERE id = $1`, [contact.id, JSON.stringify(fields)]);
      contact = { ...contact, fields, awaiting: null };
      if (step?.ask?.next) return go(flow.id, step.ask.next);
      return true;
    }
    // 3) resposta digitada igual ao texto de um botão da etapa atual (quando veio do comentário, sem botões)
    if (contact.flow_id && contact.step_id) {
      const { rows: [flow] } = await pool.query(`SELECT * FROM social_flows WHERE id = $1 AND active`, [contact.flow_id]);
      const step = flow?.steps?.find((s) => s.id === contact.step_id);
      const hit = step?.replies?.find((r) => r.next && norm(r.title) === norm(text));
      if (hit) return go(flow.id, hit.next);
    }
    // 4) palavra que começa um funil do direct
    const flow = (await activeFlows(cp.client_id, 'dm_keyword')).find((f) => matchesTrigger(f, text));
    if (flow) {
      await pool.query(`UPDATE social_flows SET runs = runs + 1 WHERE id = $1`, [flow.id]);
      await sendStep({ profile: payload.profile_username, contact, flow, step: flow.steps[0] });
      return true;
    }
    return false;
  }

  // ── equipe ──
  async function list(clientId, city = null) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT f.*, cl.company_name AS client_name, cl.logo_url AS client_logo FROM social_flows f LEFT JOIN clients cl ON cl.id = f.client_id
        WHERE ($1::uuid IS NULL OR f.client_id = $1) AND ($2::text IS NULL OR cl.city IS NULL OR lower(cl.city) = $2)
        ORDER BY f.active DESC, f.updated_at DESC`, [clientId || null, city || null]
    );
    return rows;
  }

  async function save(clientId, body, userId, id = null) {
    await ensureSchema();
    const f = normalizeFlow(body);
    if (id) {
      const { rows: [row] } = await pool.query(
        `UPDATE social_flows SET name = $3, active = $4, trigger = $5, public_reply = $6, steps = $7, updated_at = now() WHERE id = $1 AND client_id = $2 RETURNING *`,
        [id, clientId, f.name, f.active, JSON.stringify(f.trigger), f.public_reply, JSON.stringify(f.steps)]
      );
      if (!row) throw Object.assign(new Error('Funil não encontrado'), { status: 404 });
      return row;
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO social_flows (client_id, name, active, trigger, public_reply, steps, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [clientId, f.name, f.active, JSON.stringify(f.trigger), f.public_reply, JSON.stringify(f.steps), userId || null]
    );
    return row;
  }

  async function remove(id) {
    await ensureSchema();
    await pool.query(`DELETE FROM social_flows WHERE id = $1`, [id]);
    return { ok: true };
  }

  async function contacts(clientId, { tag, q } = {}) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT c.*, f.name AS flow_name FROM social_contacts c LEFT JOIN social_flows f ON f.id = c.flow_id
        WHERE c.client_id = $1 AND ($2::text IS NULL OR $2 = ANY(c.tags))
          AND ($3::text IS NULL OR c.username ILIKE '%' || $3 || '%' OR c.fields::text ILIKE '%' || $3 || '%')
        ORDER BY c.last_in_at DESC NULLS LAST, c.created_at DESC LIMIT 300`, [clientId, tag || null, q || null]
    );
    return rows;
  }

  async function messages(contactId) {
    await ensureSchema();
    await pool.query(`UPDATE social_contacts SET unread = 0 WHERE id = $1`, [contactId]);
    const { rows } = await pool.query(`SELECT * FROM social_dm_messages WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 200`, [contactId]);
    return rows.reverse();
  }

  /** A equipe responde no direct (com botões de link e respostas rápidas opcionais) e o robô pausa 24 h. */
  async function teamSend(contactId, { message, buttons = [], quick_replies = [] }, byName) {
    await ensureSchema();
    const { rows: [c] } = await pool.query(`SELECT * FROM social_contacts WHERE id = $1`, [contactId]);
    if (!c) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
    const text = clean(message, 1000);
    if (!text) throw Object.assign(new Error('Escreva a mensagem'), { status: 400 });
    if (c.last_in_at && Date.now() - new Date(c.last_in_at).getTime() > 24 * 3600_000) {
      throw Object.assign(new Error('O Instagram só deixa responder até 24 h depois da última mensagem da pessoa.'), { status: 409 });
    }
    const btns = (buttons || []).map((b) => ({ title: clean(b?.title, 20), url: clean(b?.url, 500) })).filter((b) => b.title && /^https?:\/\//.test(b.url)).slice(0, 3);
    const qrs = (quick_replies || []).map((q) => ({ title: clean(q, 20), payload: `t:${clean(q, 20)}` })).filter((q) => q.title).slice(0, 13);
    await uploadPost.call('POST', '/uploadposts/dms/send', {
      json: { platform: c.platform, user: await profileOf(c.client_id), recipient_id: c.ext_id, message: text, ...(btns.length ? { buttons: btns } : {}), ...(qrs.length ? { quick_replies: qrs } : {}) },
    });
    await log(c.id, 'out', text, { buttons: btns, replies: qrs.map((q) => q.title) }, byName || 'Equipe');
    await pool.query(`UPDATE social_contacts SET paused_until = now() + interval '24 hours' WHERE id = $1`, [c.id]);
    return { ok: true };
  }

  async function setPaused(contactId, paused) {
    await pool.query(`UPDATE social_contacts SET paused_until = $2 WHERE id = $1`, [contactId, paused ? new Date(Date.now() + 7 * 86400_000) : null]);
    return { ok: true };
  }

  async function updateContact(contactId, { tags, fields }) {
    const t = (Array.isArray(tags) ? tags : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 20);
    const f = fields && typeof fields === 'object' ? Object.fromEntries(Object.entries(fields).slice(0, 20).map(([k, v]) => [clean(k, 30), clean(v, 300)])) : {};
    await pool.query(`UPDATE social_contacts SET tags = $2, fields = $3 WHERE id = $1`, [contactId, t, JSON.stringify(f)]);
    return { ok: true };
  }

  /** Testar o funil: manda a 1ª etapa para um contato que escreveu nas últimas 24 h (ex.: o perfil da equipe). */
  async function test(flowId, contactId) {
    const { rows: [flow] } = await pool.query(`SELECT * FROM social_flows WHERE id = $1`, [flowId]);
    const { rows: [contact] } = await pool.query(`SELECT * FROM social_contacts WHERE id = $1`, [contactId]);
    if (!flow || !contact || contact.client_id !== flow.client_id) throw Object.assign(new Error('Funil ou contato não encontrado'), { status: 404 });
    await sendStep({ profile: await profileOf(flow.client_id), contact, flow, step: flow.steps[0] });
    return { ok: true };
  }

  return { ensureSchema, handleComment, handleDm, list, save, remove, contacts, messages, teamSend, setPaused, updateContact, test };
}

export function registerFlowRoutes(app, { flows, pool, verifySocialManager, scope = null, logger = console }) {
  // cidade: só os clientes da cidade ativa e os globais (ver registerSocialHubRoutes)
  const cityOf = (req) => (scope ? scope.city(req) : null);
  const guard = (req, clientId) => (scope ? scope.guard(req, clientId) : null);
  const guardItem = async (req, table, id) => {
    const { rows: [r] } = await pool.query(`SELECT client_id FROM ${table} WHERE id = $1`, [id]);
    if (!r) throw Object.assign(new Error('Não encontrado'), { status: 404 });
    await guard(req, r.client_id);
  };

  const fail = (res, error) => {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : /unauthori|login|token/i.test(error?.message || '') ? 401 : /acesso|permiss/i.test(error?.message || '') ? 403 : 500;
    if (status >= 500) logger.error('[funis]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };
  const nameOf = async (user) => {
    if (!user?.id) return null;
    const { rows: [p] } = await pool.query(`SELECT coalesce(nullif(btrim(display_name), ''), name) AS name FROM profiles WHERE id = $1`, [user.id]).catch(() => ({ rows: [] }));
    return p?.name ? String(p.name).trim().split(/\s+/)[0] : null;
  };
  const team = (fn) => async (req, res) => {
    try {
      const { user } = await verifySocialManager(req);
      res.json(await fn(req, user));
    } catch (error) { fail(res, error); }
  };
  app.get('/api/flows', team(async (req) => {
    if (req.query.client_id) await guard(req, req.query.client_id);
    return { flows: await flows.list(req.query.client_id || null, await cityOf(req)) };
  }));
  app.post('/api/flows/:clientId', team(async (req, user) => { await guard(req, req.params.clientId); return flows.save(req.params.clientId, req.body || {}, user?.id); }));
  app.put('/api/flows/:clientId/:id', team(async (req, user) => { await guard(req, req.params.clientId); return flows.save(req.params.clientId, req.body || {}, user?.id, req.params.id); }));
  app.delete('/api/flows/item/:id', team(async (req) => { await guardItem(req, 'social_flows', req.params.id); return flows.remove(req.params.id); }));
  app.post('/api/flows/item/:id/test', team(async (req) => { await guardItem(req, 'social_flows', req.params.id); return flows.test(req.params.id, req.body?.contact_id); }));
  app.get('/api/flows/contacts/:clientId', team(async (req) => { await guard(req, req.params.clientId); return { contacts: await flows.contacts(req.params.clientId, { tag: req.query.tag || null, q: req.query.q || null }) }; }));
  app.get('/api/flows/contact/:id/messages', team(async (req) => { await guardItem(req, 'social_contacts', req.params.id); return { messages: await flows.messages(req.params.id) }; }));
  app.post('/api/flows/contact/:id/send', team(async (req, user) => { await guardItem(req, 'social_contacts', req.params.id); return flows.teamSend(req.params.id, req.body || {}, await nameOf(user)); }));
  app.post('/api/flows/contact/:id/pause', team(async (req) => { await guardItem(req, 'social_contacts', req.params.id); return flows.setPaused(req.params.id, !!req.body?.paused); }));
  app.put('/api/flows/contact/:id', team(async (req) => { await guardItem(req, 'social_contacts', req.params.id); return flows.updateContact(req.params.id, req.body || {}); }));
}

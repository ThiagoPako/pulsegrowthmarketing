// ─── Cobranças da Ísis pelo Assistente PULSE (plano aprovado pelo usuário em 01/11/2026) ───────────────────────
// Financeiro → Cobranças. O modo fica em payment_config.isis_mode:
//   desligado (padrão) → nada muda: a cobrança antiga (runBillingAutomation, vencimento e +3 dias) segue igual
//   previa             → a Ísis monta as 4 mensagens do calendário no dia certo e guarda em billing_messages
//                        (status 'previa'); ninguém recebe. A equipe lê na agenda antes de ligar
//   ativo              → envia pelo número do Assistente PULSE (conexão 'assistente') ao WhatsApp do cliente; a
//                        cobrança antiga deixa de mandar para os contratos dessa cidade
// Rotas (só admin):
//   GET /api/billing-isis/config · PUT /api/billing-isis/config { mode, card_fee_percent, templates{} }
//   GET /api/billing-isis/agenda?month=AAAA-MM   contratos com as 4 etapas (data, status, mensagem guardada)
//   GET /api/billing-isis/preview?contract_id=&step=&date=[&pdf=1]   texto (ou o PDF) que sairia (nada é gravado)
// Toda mensagem leva o PDF no modelo da Pulse (lib/billingPdf.mjs; pedido do usuário, 01/11/2026), gerado e guardado
// em uploads/cobrancas/ antes do envio, e o rodapé com o contato da cidade do cliente (lib/contactByCity.mjs).

import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {
  BILLING_STEPS, MODES, DEFAULT_TEMPLATES, monthName, previousMonth, nextMonth, stepDates, attendanceTip,
  brl, pixPayload, CARD_NOTICE, ensurePayLink, payToken, valorPorExtenso, effectiveTemplate, recordingsText, pixOnlyMessage, applyTemplate, bulletList, DEFAULT_FOOTER, withFooter, footerText, checkBillingData,
} from './lib/billingIsis.mjs';
import { renderPdf } from './lib/billingPdf.mjs';
import { cobrancaDoc, relatorioDoc, agradecimentoDoc, reciboDoc, monthName as nomeMes } from './lib/billingPdfDocs.mjs';
import { contactForCity, contactInfo } from './lib/contactByCity.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';
import { monthCalendar } from './lib/monthDates.mjs';
import { videoFrame } from './lib/videoFrame.mjs';
import { enqueueWhatsApp } from './whatsapp/shared.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const pad2 = (n) => String(n).padStart(2, '0');
const TEMPLATE_COLUMNS = {
  relatorio_mensal: 'msg_isis_relatorio',
  pre_vencimento: 'msg_isis_pre',
  cobranca: 'msg_isis_cobranca',
  lembrete: 'msg_isis_lembrete',
  obrigado: 'msg_isis_obrigado',
};
// modelos editáveis na tela: as 4 etapas do calendário + o obrigado depois do pagamento
const TEMPLATE_STEPS = [...BILLING_STEPS, 'obrigado'];
const todayBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dateKey = (v) => (!v ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const isPaid = (r) => r?.status === 'recebida' || r?.status === 'pago';
// cidade de uma linha de payment_config (sem coluna de cidade: a única conta, tratada como Minaçu)
const cityOf = (cfg) => normalizeCityValue(cfg?.city) || 'minacu';
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const DOC_NAMES = { relatorio_mensal: 'Relatorio', pre_vencimento: 'Agenda', cobranca: 'Cobranca', lembrete: 'Cobranca', obrigado: 'Recibo' };

export function registerBillingIsisRoutes(app, {
  pool, verifyAdmin, paymentConfigFor, socialReports, paymentLink = async () => null, uploadRoot, publicUploadsUrl,
  publicAppUrl = process.env.PUBLIC_APP_URL || 'https://agenciapulse.tech', logger = console,
}) {
  const appBase = String(publicAppUrl).replace(/\/+$/, '');
  const uploadsBase = String(publicUploadsUrl || 'https://agenciapulse.tech/uploads').replace(/\/+$/, '');
  let schemaPromise = null;
  function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await pool.query(`
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS isis_mode TEXT NOT NULL DEFAULT 'desligado';
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS card_fee_percent NUMERIC NOT NULL DEFAULT 0;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS infinitepay_handle TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_relatorio TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_pre TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_cobranca TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_lembrete TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_rodape TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS msg_isis_obrigado TEXT;
          -- o obrigado só vale para pagamentos a partir do dia em que a função entrou (nada de agradecer o passado)
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS obrigado_desde DATE DEFAULT CURRENT_DATE;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS contact_name TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS contact_phone TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS pdf_url TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS body TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS reference_month TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS contract_id UUID;
          -- página pública de pagamento de cada cobrança (/pagar/<token>): uma por contrato e mês
          CREATE TABLE IF NOT EXISTS billing_pay_pages (
            token TEXT PRIMARY KEY,
            contract_id UUID NOT NULL,
            client_id UUID,
            month TEXT NOT NULL,
            revenue_id UUID,
            client_name TEXT,
            plan_name TEXT,
            amount NUMERIC NOT NULL,
            due_date DATE,
            pix_payload TEXT,
            pix_key TEXT,
            receiver_name TEXT,
            card_link TEXT,
            city TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (contract_id, month)
          );
        `);
      })().catch((error) => { schemaPromise = null; throw error; });
    }
    return schemaPromise;
  }
  ensureSchema().catch((error) => logger.error('[cobranca-isis] esquema:', error.message));

  function sendError(res, error) {
    const status = error?.status || (error?.message === 'Unauthorized' ? 401 : error?.message === 'Admin access required' ? 403 : 500);
    if (status >= 500) logger.error('[cobranca-isis] erro:', error);
    res.status(status).json({ error: error?.message || 'Erro' });
  }

  const templateOf = (config, step) => effectiveTemplate(step, config?.[TEMPLATE_COLUMNS[step]]);
  const modeOf = (config) => (MODES.includes(config?.isis_mode) ? config.isis_mode : 'desligado');

  // dados do cliente, do plano e do emitente para os PDFs (lib/billingPdfDocs.mjs)
  const clientOf = (contract) => ({
    name: String(contract.company_name || '').trim(), responsible: String(contract.responsible_person || '').trim(),
    city: normalizeCityValue(contract.client_city || contract.city) || '', plan: contract.plan_name || '',
  });
  const planOf = (contract) => ({
    reels_qty: contract.reels_qty, creatives_qty: contract.creatives_qty, stories_qty: contract.stories_qty,
    arts_qty: contract.arts_qty, recording_sessions: contract.recording_sessions,
  });
  const issuerOf = (contract, config) => ({
    name: config?.receiver_name || 'Agência Pulse', document: config?.document || '',
    city: normalizeCityValue(contract.client_city || contract.city) || '',
  });

  async function activeContracts() {
    const { rows } = await pool.query(
      `SELECT fc.*, c.company_name, c.whatsapp, c.city AS client_city, c.responsible_person, c.niche, p.name AS plan_name,
              p.reels_qty, p.creatives_qty, p.stories_qty, p.arts_qty, p.recording_sessions
         FROM financial_contracts fc
         JOIN clients c ON c.id = fc.client_id
         LEFT JOIN plans p ON p.id = fc.plan_id
        WHERE fc.status = 'ativo' AND coalesce(c.status, 'ativo') <> 'cancelado'
        ORDER BY c.company_name`
    );
    return rows;
  }

  // mensalidade do mês (mesma regra da cobrança antiga: sem recorrência extra nem lançamento manual)
  async function monthRevenue(contract, month) {
    const { rows } = await pool.query(
      `SELECT * FROM revenues
        WHERE client_id = $1 AND recurrence_id IS NULL AND (description IS NULL OR btrim(description) = '')
          AND (contract_id IS NULL OR contract_id = $2) AND to_char(reference_month, 'YYYY-MM') = $3
        ORDER BY (contract_id = $2) DESC NULLS LAST, created_at ASC`,
      [contract.client_id, contract.id, month]
    ).catch(() => ({ rows: [] }));
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const day = Math.min(Math.max(Number(contract.due_day) || 10, 1), last);
    return {
      rows,
      revenue: rows[0] || null,
      paid: rows.some(isPaid),
      dueDate: dateKey(rows[0]?.due_date) || `${month}-${pad2(day)}`,
      amount: Number(rows[0]?.amount ?? contract.contract_value) || 0,
    };
  }

  // mensalidades dos meses anteriores (o que ficou em aberto e os últimos pagamentos, para o PDF)
  async function previousRevenues(contract, month) {
    const { rows } = await pool.query(
      `SELECT * FROM revenues
        WHERE client_id = $1 AND recurrence_id IS NULL AND (description IS NULL OR btrim(description) = '')
          AND (contract_id IS NULL OR contract_id = $2) AND to_char(reference_month, 'YYYY-MM') < $3
        ORDER BY reference_month DESC LIMIT 12`,
      [contract.client_id, contract.id, month]
    ).catch(() => ({ rows: [] }));
    return rows;
  }

  async function attendance(clientId, month) {
    const { rows: rec } = await pool.query(
      `SELECT status FROM recordings WHERE client_id = $1 AND to_char(date, 'YYYY-MM') = $2`, [clientId, month]
    ).catch(() => ({ rows: [] }));
    const { rows: dr } = await pool.query(
      `SELECT videos_recorded FROM delivery_records WHERE client_id = $1 AND to_char(date, 'YYYY-MM') = $2`, [clientId, month]
    ).catch(() => ({ rows: [] }));
    const cancelled = rec.filter((r) => ['cancelada', 'cancelado'].includes(r.status)).length;
    const done = rec.filter((r) => ['concluida', 'concluido', 'realizada'].includes(r.status)).length;
    const videos = dr.reduce((a, d) => a + (Number(d.videos_recorded) || 0), 0);
    return { done, scheduled: rec.length - cancelled, cancelled, avg: dr.length ? Math.round((videos / dr.length) * 10) / 10 : null };
  }

  async function assistantNumbers() {
    const { rows } = await pool.query(`SELECT name, phone, active FROM assistant_numbers`).catch(() => ({ rows: [] }));
    return rows;
  }

  // ── extras do relatório premium (capa, calendário, portal, equipe) ──
  const PROFILE_ROLES = { videomaker: 'Videomaker', editor: 'Edição de vídeo', designer: 'Design', social_media: 'Social media', admin: 'Direção', gestor: 'Gestão' };
  const AGENT_ROLES_PT = { chefe: 'Coordenação', editor: 'Edição de vídeo', revisor: 'Revisão de vídeo', colorista: 'Cor', som: 'Som', social_media: 'Social media', designer: 'Design', revisor_arte: 'Revisão de artes', roteirista: 'Roteiros' };
  // agentes que trabalham em todo projeto (os editores entram quando mexeram nos cards do cliente no mês)
  const ALWAYS_AGENTS = ['chefe', 'revisor', 'colorista', 'som', 'social_media'];

  /** Imagem PNG/JPEG para o PDF (upload local lido do disco; de fora, com tempo e tamanho limitados); senão null. */
  async function loadImage(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    const okImage = (b) => b && b.length > 64 && b.length < 4_000_000
      && (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) || (b[0] === 0xff && b[1] === 0xd8));
    try {
      const abs = new URL(raw, appBase);
      const i = abs.pathname.indexOf('/uploads/');
      if (i >= 0 && (abs.origin === new URL(appBase).origin || abs.href.startsWith(uploadsBase))) {
        const file = path.resolve(uploadRoot, decodeURIComponent(abs.pathname.slice(i + '/uploads/'.length)));
        if (file.startsWith(path.resolve(uploadRoot))) {
          const b = await fs.readFile(file).catch(() => null);
          return okImage(b) ? b : null;
        }
      }
      const res = await fetch(abs.href, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;
      const b = Buffer.from(await res.arrayBuffer());
      return okImage(b) ? b : null;
    } catch {
      return null;
    }
  }

  /** O vídeo para o ffmpeg: upload local vira caminho no disco; link http(s) vai direto; o resto (Drive) não serve. */
  function videoInput(link) {
    const raw = String(link || '').trim();
    if (!raw) return null;
    try {
      const abs = new URL(raw, appBase);
      const i = abs.pathname.indexOf('/uploads/');
      if (i >= 0) {
        const file = path.resolve(uploadRoot, decodeURIComponent(abs.pathname.slice(i + '/uploads/'.length)));
        if (file.startsWith(path.resolve(uploadRoot))) return file;
      }
      return /^https?:$/.test(abs.protocol) && !/drive\.google|docs\.google/.test(abs.hostname) ? abs.href : null;
    } catch {
      return null;
    }
  }

  async function reportExtras(contract, ref, next, config) {
    const q = (sql, params) => pool.query(sql, params).then((r) => r.rows).catch(() => []);
    const [client] = await q(`SELECT logo_url FROM clients WHERE id = $1`, [contract.client_id]);
    const recordings = await q(
      `SELECT date, start_time FROM recordings WHERE client_id = $1 AND to_char(date, 'YYYY-MM') = $2
          AND coalesce(status, '') NOT IN ('cancelada', 'cancelado') ORDER BY date, start_time`, [contract.client_id, next]
    );
    // destaques: a capa do card ou, sem capa, um quadro do próprio vídeo editado
    const covers = await q(
      `SELECT title, cover_url, edited_video_link, content_type FROM content_tasks
        WHERE client_id = $1 AND to_char(coalesce(approved_at, updated_at), 'YYYY-MM') = $2
          AND (nullif(btrim(cover_url), '') IS NOT NULL OR nullif(btrim(edited_video_link), '') IS NOT NULL)
        ORDER BY (content_type = 'story') ASC, approved_at DESC NULLS LAST LIMIT 6`, [contract.client_id, ref]
    );
    // stories postados no mês (social_media_deliveries)
    const [stories] = await q(
      `SELECT count(*)::int AS n FROM social_media_deliveries
        WHERE client_id = $1 AND content_type ILIKE 'stor%' AND status IN ('postado', 'entregue', 'concluido')
          AND to_char(coalesce(posted_at, delivered_at), 'YYYY-MM') = $2`, [contract.client_id, ref]
    );
    // quem trabalhou nos cards e nas gravações do cliente no mês
    const ids = new Set();
    for (const r of await q(`SELECT assigned_to, edited_by, agent_review_by, agent_step_by FROM content_tasks WHERE client_id = $1 AND to_char(updated_at, 'YYYY-MM') = $2`, [contract.client_id, ref])) {
      for (const v of Object.values(r)) if (v) ids.add(v);
    }
    for (const r of await q(`SELECT assigned_to, collaborator_id FROM design_tasks WHERE client_id = $1 AND to_char(updated_at, 'YYYY-MM') = $2`, [contract.client_id, ref])) {
      for (const v of Object.values(r)) if (v) ids.add(v);
    }
    for (const r of await q(`SELECT videomaker_id FROM recordings WHERE client_id = $1 AND to_char(date, 'YYYY-MM') = $2`, [contract.client_id, ref])) {
      if (r.videomaker_id) ids.add(r.videomaker_id);
    }
    const rows = await q(
      `SELECT DISTINCT ON (p.id) p.id, coalesce(nullif(btrim(p.display_name), ''), p.name) AS name, p.avatar_url, p.role::text AS role, k.role AS agent_role
         FROM profiles p LEFT JOIN agent_keys k ON k.user_id = p.id AND k.revoked_at IS NULL
        WHERE p.id = ANY($1::uuid[]) OR k.role = ANY($2::text[])
        ORDER BY p.id, k.created_at DESC NULLS LAST`, [[...ids], ALWAYS_AGENTS]
    );
    const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
    const people = [];
    const agents = [];
    for (const r of rows.slice(0, 24)) {
      const photo = await loadImage(r.avatar_url);
      if (r.agent_role) agents.push({ name: firstName(r.name), role: AGENT_ROLES_PT[r.agent_role] || 'Agente', photo });
      else people.push({ name: firstName(r.name), role: PROFILE_ROLES[r.role] || 'Equipe Pulse', photo });
    }
    const highlights = [];
    for (const c of covers) {
      if (highlights.length >= 3) break;
      const image = (await loadImage(c.cover_url)) || (await videoFrame(videoInput(c.edited_video_link)));
      // sem quadro bom, o vídeo não entra nos destaques (nada de imagem ilustrativa)
      if (image) highlights.push({ image, title: String(c.title || '').trim() || 'Vídeo' });
    }
    const contact = contactForCity(contract.client_city || contract.city, config, await assistantNumbers());
    return {
      clientLogo: await loadImage(client?.logo_url),
      recordings: recordings.map((r) => ({ date: dateKey(r.date), time: r.start_time })),
      highlights,
      storiesPosted: stories ? stories.n : null,
      team: { people: people.slice(0, 8), agents: agents.slice(0, 8) },
      portalUrl: `${appBase}/portal/${contract.client_id}`,
      contact: contact?.phone ? `${contact.name} · ${contact.phone}` : null,
    };
  }

  /** Página de pagamento da cobrança (uma por contrato e mês; o token não muda entre a cobrança e o lembrete). */
  async function payPage(contract, month, data) {
    await ensureSchema();
    const { rows: [row] } = await pool.query(
      `INSERT INTO billing_pay_pages (token, contract_id, client_id, month, revenue_id, client_name, plan_name, amount, due_date,
                                      pix_payload, pix_key, receiver_name, card_link, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (contract_id, month) DO UPDATE SET
         revenue_id = EXCLUDED.revenue_id, client_name = EXCLUDED.client_name, plan_name = EXCLUDED.plan_name,
         amount = EXCLUDED.amount, due_date = EXCLUDED.due_date, pix_payload = EXCLUDED.pix_payload, pix_key = EXCLUDED.pix_key,
         receiver_name = EXCLUDED.receiver_name, card_link = coalesce(EXCLUDED.card_link, billing_pay_pages.card_link),
         city = EXCLUDED.city, updated_at = now()
       RETURNING token`,
      [payToken(crypto.randomBytes), contract.id, contract.client_id, month, data.revenueId || null, data.clientName, data.planName,
        data.amount, data.dueDate || null, data.pix, data.pixKey, data.receiver, data.cardLink || null, data.city || null]
    );
    return `${appBase}/pagar/${row.token}`;
  }

  // ── obrigado depois do pagamento confirmado (baixa da InfinitePay ou manual no Financeiro), uma vez por cobrança ──
  const thanking = new Set();

  /** Agradece o pagamento de uma mensalidade: mensagem + recibo em PDF, pelo número do PULSE. */
  async function thankRevenue(revenueId) {
    if (!revenueId || thanking.has(revenueId)) return { skip: 'em andamento' };
    thanking.add(revenueId);
    try {
      await ensureSchema();
      const { rows: [rev] } = await pool.query(`SELECT * FROM revenues WHERE id = $1`, [revenueId]);
      if (!rev || !isPaid(rev)) return { skip: 'não paga' };
      if (rev.recurrence_id || String(rev.description || '').trim()) return { skip: 'não é mensalidade' };
      const { rows: done } = await pool.query(
        `SELECT 1 FROM billing_messages WHERE revenue_id = $1 AND message_type = 'obrigado' LIMIT 1`, [revenueId]
      );
      if (done.length) return { skip: 'já agradecido' };
      const contract = (await activeContracts()).find((c) => c.client_id === rev.client_id && (!rev.contract_id || c.id === rev.contract_id));
      if (!contract) return { skip: 'sem contrato ativo' };
      const config = await paymentConfigFor(contract.city || contract.client_city);
      const mode = modeOf(config);
      if (mode === 'desligado') return { skip: 'desligado' };
      const paidAt = dateKey(rev.paid_at) || todayBr();
      if (config?.obrigado_desde && paidAt < dateKey(config.obrigado_desde)) return { skip: 'antes da função' };
      const month = dateKey(rev.reference_month).slice(0, 7) || paidAt.slice(0, 7);
      const amount = Number(rev.amount) || 0;
      const { rows: [pl] } = await pool.query(
        `SELECT capture_method FROM payment_links WHERE revenue_id = $1 AND paid_at IS NOT NULL ORDER BY paid_at DESC LIMIT 1`, [revenueId]
      ).catch(() => ({ rows: [] }));
      const contact = contactForCity(contract.client_city || contract.city, config, await assistantNumbers());
      const note = footerText(config?.msg_isis_rodape, contact);
      const spec = {
        ...reciboDoc({
          month, paidAt, amount, amountWords: valorPorExtenso(amount), method: pl?.capture_method || null,
          client: clientOf(contract), plan: planOf(contract), issuer: issuerOf(contract, config),
        }),
        number: `REC-${month.replace('-', '')}-${String(contract.id).slice(0, 4).toUpperCase()}`,
        issued: dataBr(todayBr()),
        footerNote: note ? note.replace(/^—\s*/, '').replace(/_/g, '').trim() : '',
        footerContact: `${String(contract.company_name || '').trim()} · ${contact.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'}`,
      };
      if (spec.parties?.[0] && contact?.phone) spec.parties[0].lines[2] = `Contato: ${contact.name} · ${contact.phone}`;
      const pdf = await savePdf(contract, 'obrigado', month, spec).catch((error) => {
        logger.error('[cobranca-isis] recibo:', error.message);
        return null;
      });
      const body = withFooter(applyTemplate(templateOf(config, 'obrigado'), {
        nome_cliente: String(contract.company_name || '').trim(), plano: contract.plan_name || 'plano mensal', valor: brl(amount),
        mes_ref: nomeMes(month), data_pagamento: dataBr(paidAt),
        recibo: pdf?.ok ? 'Recibo em anexo.' : '',
      }), config?.msg_isis_rodape, contact);
      if (!contract.whatsapp) {
        await record(contract, 'obrigado', month, 'sem_whatsapp', body, revenueId, pdf?.ok ? pdf.url : null);
        return { status: 'sem_whatsapp' };
      }
      if (mode === 'previa') {
        await record(contract, 'obrigado', month, 'previa', body, revenueId, pdf?.ok ? pdf.url : null);
        return { status: 'previa', body };
      }
      await enqueueWhatsApp(pool, {
        to: contract.whatsapp, body, purpose: 'assistente', triggerType: 'cobranca', clientId: contract.client_id,
        ...(pdf?.ok ? { mediaUrl: pdf.url, mediaName: pdf.name } : {}),
      });
      await record(contract, 'obrigado', month, 'enviada', body, revenueId, pdf?.ok ? pdf.url : null);
      return { status: 'enviada', body };
    } finally {
      thanking.delete(revenueId);
    }
  }

  /** Varre as mensalidades pagas nos últimos 3 dias sem obrigado (pega a baixa manual do Financeiro). */
  async function sweepThanks() {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT r.id FROM revenues r
        WHERE r.status IN ('recebida', 'pago') AND r.recurrence_id IS NULL AND (r.description IS NULL OR btrim(r.description) = '')
          AND r.paid_at IS NOT NULL AND r.paid_at::date >= current_date - 3
          AND NOT EXISTS (SELECT 1 FROM billing_messages m WHERE m.revenue_id = r.id AND m.message_type = 'obrigado')
        ORDER BY r.paid_at`
    ).catch(() => ({ rows: [] }));
    const results = [];
    for (const r of rows) {
      results.push({ revenue_id: r.id, ...(await thankRevenue(r.id).catch((error) => ({ error: error.message }))) });
    }
    return results;
  }
  // a cada 10 min (a baixa manual não avisa ninguém); a da InfinitePay chama thankRevenue na hora
  if (process.env.NODE_ENV !== 'test') {
    const timer = setInterval(() => sweepThanks().catch((error) => logger.error('[cobranca-isis] obrigado:', error.message)), 10 * 60 * 1000);
    timer.unref?.();
  }

  /** Texto de uma etapa com o rodapé (contato da cidade do cliente) e o PDF a montar; { skip } quando não deve sair. */
  async function compose(contract, step, date, month = date.slice(0, 7)) {
    const out = await composeBody(contract, step, date, month);
    if (!out.body) return out;
    const contact = contactForCity(contract.client_city || contract.city, out.config, await assistantNumbers());
    const note = footerText(out.config?.msg_isis_rodape, contact);
    const pdf = out.pdf && {
      ...out.pdf,
      number: `PULSE-${month.replace('-', '')}-${String(contract.id).slice(0, 4).toUpperCase()}`,
      issued: dataBr(date),
      footerNote: note ? note.replace(/^—\s*/, '').replace(/_/g, '').trim() : '',
      footerContact: `${String(contract.company_name || '').trim()} · ${contact.city === 'uruacu' ? 'Uruaçu' : 'Minaçu'}`,
      generated: `gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    };
    // contato da cidade no emitente
    if (pdf?.parties?.[0] && contact?.phone) pdf.parties[0].lines[2] = `Contato: ${contact.name} · ${contact.phone}`;
    return { ...out, contact, pdf, body: withFooter(out.body, out.config?.msg_isis_rodape, contact) };
  }

  /** Gera o PDF e guarda em uploads/cobrancas/<cliente>/<mês>/; devolve { url, name }. */
  async function savePdf(contract, step, month, spec) {
    const buffer = await renderPdf(spec);
    const dir = path.resolve(uploadRoot, 'cobrancas', String(contract.client_id), month);
    await fs.mkdir(dir, { recursive: true });
    const file = `${step}-${Date.now()}.pdf`;
    await fs.writeFile(path.join(dir, file), buffer);
    // conferido: é PDF, tem conteúdo e foi gravado inteiro
    const saved = await fs.stat(path.join(dir, file)).catch(() => null);
    const ok = buffer.subarray(0, 5).toString() === '%PDF-' && buffer.length > 5000 && saved?.size === buffer.length;
    const slug = String(contract.company_name || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return {
      ok,
      url: `${uploadsBase}/cobrancas/${contract.client_id}/${month}/${file}`,
      name: `${DOC_NAMES[step]}-Pulse-${slug}-${month}.pdf`,
    };
  }

  async function composeBody(contract, step, date, month) {
    const config = await paymentConfigFor(contract.city || contract.client_city);
    const base = { nome_cliente: String(contract.company_name || '').trim() };

    if (step === 'relatorio_mensal') {
      const ref = previousMonth(`${month}-01`);
      const report = await socialReports.reportFor(contract.client_id, ref).catch(() => null);
      if (!report) return { skip: 'sem relatório do mês' };
      if (report.draft.status !== 'aprovado') return { skip: 'aguardando_relatorio', config };
      const n = report.numbers;
      const net = report.network?.connected && report.network.current
        ? [
          report.network.current.reach !== null ? `${Number(report.network.current.reach).toLocaleString('pt-BR')} contas alcançadas` : '',
          report.network.current.followers_gained !== null ? `${report.network.current.followers_gained >= 0 ? '+' : ''}${report.network.current.followers_gained} seguidores` : '',
          report.network.current.interactions !== null ? `${Number(report.network.current.interactions).toLocaleString('pt-BR')} interações` : '',
        ].filter(Boolean).join(' · ')
        : '';
      const pdfRelatorio = relatorioDoc({
        ref, prev: previousMonth(`${ref}-01`), next: month, client: clientOf(contract), plan: planOf(contract), issuer: issuerOf(contract, config),
        numbers: n, network: report.network, suggestions: report.draft.suggestions,
        // calendário editorial do mês que começa: feriados (arte de aviso) e datas do nicho do cliente
        calendar: monthCalendar(month, contract.niche),
        // resumo, gravações agendadas, stories, destaques, portal e equipe
        ...(await reportExtras(contract, ref, month, config)),
        instagram: /^@/.test(String(report.network?.account || '')) ? report.network.account : null,
      });
      return {
        config,
        pdf: pdfRelatorio,
        body: applyTemplate(templateOf(config, step), {
          ...base,
          mes_anterior: monthName(`${ref}-01`), mes_atual: monthName(`${month}-01`),
          qtd_videos: n.deliveries.videos.total, qtd_artes: n.deliveries.arts.total, qtd_posts: n.deliveries.posts.total,
          qtd_gravacoes: n.deliveries.recordings.done,
          horas_dedicadas: n.time.total_hours > 0 ? n.time.total_hours.toLocaleString('pt-BR') : '',
          resumo_rede: net, sugestoes: bulletList(report.draft.suggestions), link_relatorio: '',
        }),
      };
    }

    const { rows: monthRows, revenue, paid, dueDate, amount } = await monthRevenue(contract, month);
    if (step !== 'pre_vencimento' && paid) return { skip: 'pago', config };
    if (step === 'cobranca' || step === 'lembrete') {
      const problems = checkBillingData({ contractValue: contract.contract_value, revenues: monthRows, month });
      // duas contas (Uruaçu e Minaçu): sem a configuração da cidade do cliente, não cobra na conta da outra
      const clientCity = normalizeCityValue(contract.client_city || contract.city) || 'minacu';
      if (config && config.city !== undefined && cityOf(config) !== clientCity) {
        problems.push(`${clientCity === 'uruacu' ? 'Uruaçu' : 'Minaçu'} está sem conta cadastrada em Financeiro → Config (o Pix sairia na conta da outra cidade)`);
      }
      if (!config?.pix_key) problems.push('a cidade do cliente está sem chave Pix em Financeiro → Config');
      if (problems.length) return { skip: 'conferir', problems, config };
    }

    if (step === 'pre_vencimento') {
      const ref = previousMonth(`${month}-01`);
      const a = await attendance(contract.client_id, ref);
      return {
        config,
        pdf: agradecimentoDoc({
          ref, client: clientOf(contract), plan: planOf(contract), attendance: a, tip: attendanceTip(a), dueDate, amount,
          numbers: (await socialReports.reportFor(contract.client_id, ref).catch(() => null))?.numbers || null,
        }),
        body: applyTemplate(templateOf(config, step), {
          ...base, mes_ref: monthName(`${ref}-01`), gravacoes: recordingsText(a.done), gravacoes_feitas: a.done, gravacoes_marcadas: a.scheduled,
          media_videos: a.avg === null ? '' : a.avg.toLocaleString('pt-BR'),
          dica_assiduidade: attendanceTip(a), dia_vencimento: String(Number(dueDate.slice(8, 10))),
        }),
      };
    }

    const pix = pixPayload({ key: config?.pix_key, name: config?.receiver_name, city: contract.city || contract.client_city, amount, txid: `PULSE${month.replace('-', '')}` });
    // o link é no valor da mensalidade: a taxa do cartão a InfinitePay repassa na hora do pagamento (usuário, 01/11/2026)
    const link = await paymentLink({ contract, revenue, amount, month }).catch((error) => {
      logger.error('[cobranca-isis] link de pagamento:', error.message);
      return null;
    });
    const plano = contract.plan_name || 'plano mensal';
    const history = await previousRevenues(contract, month);
    const payUrl = await payPage(contract, month, {
      revenueId: revenue?.id, clientName: String(contract.company_name || '').trim(), planName: plano, amount, dueDate,
      pix, pixKey: config?.pix_key, receiver: config?.receiver_name, cardLink: link, city: normalizeCityValue(contract.client_city || contract.city),
    }).catch((error) => {
      logger.error('[cobranca-isis] página de pagamento:', error.message);
      return null;
    });
    return {
      config,
      revenue,
      pdf: cobrancaDoc({
        month, today: date, dueDate, amount, status: step === 'lembrete' ? 'vencido' : 'aberto',
        client: clientOf(contract), plan: planOf(contract), issuer: issuerOf(contract, config), history,
        payment: { pixPayload: pix, pixKey: config?.pix_key, receiver: config?.receiver_name, cardLink: link, cardAmount: link ? brl(amount) : null, cardNotice: CARD_NOTICE, payUrl, amount: brl(amount) },
      }),
      payUrl,
      // o código Pix sozinho, numa mensagem logo depois, para o cliente tocar, segurar e copiar (nada além do código)
      pixMessage: pixOnlyMessage(pix),
      body: applyTemplate(payUrl ? ensurePayLink(templateOf(config, step)) : templateOf(config, step), {
        ...base, link_pagamento: payUrl, plano, valor: brl(amount), mes_ref: monthName(`${month}-01`),
        pix_copia_cola: pix, chave_pix: config?.pix_key, nome_recebedor: config?.receiver_name,
        link_infinitepay: link, aviso_cartao: link ? CARD_NOTICE : '',
      }),
    };
  }

  /** Não bateu com o Financeiro: avisa o contato da cidade (o da equipe) pelo número do PULSE. */
  async function warnTeam(contract, step, month, problems) {
    const who = await contactInfo(pool, contract.client_city || contract.city).catch(() => null);
    if (!who?.telefone) return false;
    const text = [
      `⚠️ Ísis: não mandei ${step === 'lembrete' ? 'o lembrete' : 'a cobrança'} de ${String(contract.company_name || '').trim()} (${month.slice(5, 7)}/${month.slice(0, 4)}).`,
      ...problems.map((p) => `• ${p}`),
      'Confira em Financeiro → Receitas; a mensagem fica em Financeiro → Cobranças.',
    ].join('\n');
    await enqueueWhatsApp(pool, { to: who.telefone, body: text, purpose: 'assistente', triggerType: 'cobranca_conferir', history: false });
    return true;
  }

  async function alreadyHandled(contract, step, month) {
    const { rows } = await pool.query(
      `SELECT 1 FROM billing_messages WHERE client_id = $1 AND message_type = $2 AND reference_month = $3 LIMIT 1`,
      [contract.client_id, step, month]
    );
    return rows.length > 0;
  }

  async function record(contract, step, month, status, body, revenueId = null, pdfUrl = null) {
    await pool.query(
      `INSERT INTO billing_messages (client_id, revenue_id, message_type, status, body, reference_month, contract_id, pdf_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [contract.client_id, revenueId, step, status, body || null, month, contract.id, pdfUrl]
    );
  }

  /** Roda no agendador das 9h (junto da cobrança antiga). Só mexe nos contratos de cidade em prévia ou ativo. */
  async function run({ today = todayBr() } = {}) {
    await ensureSchema();
    const results = [];
    for (const contract of await activeContracts()) {
      if (contract.billing_enabled === false) continue;
      const config = await paymentConfigFor(contract.city || contract.client_city);
      const mode = modeOf(config);
      if (mode === 'desligado') continue;
      // o D−5 de um vencimento dia 3 cai no mês anterior e o D+3 de um dia 30 no seguinte: olha os 3 meses
      const thisMonth = today.slice(0, 7);
      const due = [];
      for (const month of [previousMonth(`${thisMonth}-01`), thisMonth, nextMonth(thisMonth)]) {
        const dates = stepDates((await monthRevenue(contract, month)).dueDate);
        for (const step of BILLING_STEPS) if (dates[step] === today) due.push({ step, month });
      }
      for (const { step, month } of due) {
        try {
          if (await alreadyHandled(contract, step, month)) continue;
          const out = await compose(contract, step, today, month);
          if (out.skip === 'pago') continue;
          if (out.skip === 'conferir') {
            await record(contract, step, month, 'conferir', `Não bate com o Financeiro:\n${out.problems.map((p) => `• ${p}`).join('\n')}`);
            const warned = mode === 'ativo' ? await warnTeam(contract, step, month, out.problems).catch(() => false) : false;
            results.push({ client: contract.company_name, step, status: 'conferir', problems: out.problems, warned });
            continue;
          }
          if (out.skip) {
            // relatório ainda não aprovado: fica marcado (a agenda mostra) e não tenta de novo no mês
            await record(contract, step, month, out.skip === 'aguardando_relatorio' ? 'aguardando_relatorio' : 'pulado', null);
            continue;
          }
          // o PDF sai antes do envio e fica guardado (a agenda e a prévia mostram o mesmo arquivo)
          const pdf = out.pdf ? await savePdf(contract, step, month, out.pdf) : null;
          // nada sai sem o PDF pronto e conferido
          if (out.pdf && !pdf?.ok) {
            await record(contract, step, month, 'conferir', 'O PDF não ficou pronto: nada foi enviado.');
            if (mode === 'ativo') await warnTeam(contract, step, month, ['o PDF não ficou pronto']).catch(() => false);
            results.push({ client: contract.company_name, step, status: 'conferir', problems: ['PDF'] });
            continue;
          }
          if (!contract.whatsapp) { await record(contract, step, month, 'sem_whatsapp', out.body, out.revenue?.id, pdf?.url); continue; }
          if (mode === 'previa') {
            await record(contract, step, month, 'previa', out.body, out.revenue?.id, pdf?.url);
          } else {
            await enqueueWhatsApp(pool, {
              to: contract.whatsapp, body: out.body, purpose: 'assistente', triggerType: 'cobranca', clientId: contract.client_id,
              ...(pdf ? { mediaUrl: pdf.url, mediaName: pdf.name } : {}),
            });
            if (out.pixMessage) {
              await enqueueWhatsApp(pool, {
                to: contract.whatsapp, body: out.pixMessage, purpose: 'assistente', triggerType: 'cobranca', clientId: contract.client_id,
              });
            }
            await record(contract, step, month, 'enviada', out.body, out.revenue?.id, pdf?.url);
          }
          results.push({ client: contract.company_name, step, status: mode === 'previa' ? 'previa' : 'enviada' });
        } catch (error) {
          logger.error('[cobranca-isis]', contract.company_name, step, error.message);
          results.push({ client: contract.company_name, step, status: 'erro', error: error.message });
        }
      }
    }
    return results;
  }

  // ── tela ──
  app.get('/api/billing-isis/config', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const config = await paymentConfigFor(null);
      res.json({
        mode: modeOf(config),
        card_fee_percent: Number(config?.card_fee_percent) || 0,
        has_pix: !!config?.pix_key,
        // as duas contas (Uruaçu e Minaçu): o Pix vem de Financeiro → Config da cidade; a InfiniteTag é editada aqui
        accounts: await accountsByCity(),
        templates: Object.fromEntries(TEMPLATE_STEPS.map((s) => [s, templateOf(config, s)])),
        defaults: DEFAULT_TEMPLATES,
        footer: footerText(config?.msg_isis_rodape, { name: '{contato_nome}', phone: '{contato_telefone}' }) === footerText(null, { name: '{contato_nome}', phone: '{contato_telefone}' })
          ? DEFAULT_FOOTER : (config?.msg_isis_rodape ?? DEFAULT_FOOTER),
        default_footer: DEFAULT_FOOTER,
        // contato do rodapé por cidade (Uruaçu → Thiago, Minaçu → Victor; telefone do Assistente PULSE se vazio)
        contacts: await contactsByCity(),
      });
    } catch (error) { sendError(res, error); }
  });

  async function accountsByCity() {
    const out = {};
    for (const city of ['uruacu', 'minacu']) {
      const cfg = await paymentConfigFor(city);
      const own = !!cfg && cityOf(cfg) === city;
      out[city] = {
        own,
        pix_key: own ? cfg.pix_key || '' : '',
        receiver: own ? cfg.receiver_name || '' : '',
        bank: own ? cfg.bank || '' : '',
        infinitepay_handle: own ? cfg.infinitepay_handle || '' : '',
      };
    }
    return out;
  }

  async function contactsByCity() {
    const { rows } = await pool.query('SELECT * FROM payment_config').catch(() => ({ rows: [] }));
    const numbers = await assistantNumbers();
    const out = {};
    for (const city of ['uruacu', 'minacu']) {
      const cfg = (await paymentConfigFor(city)) || {};
      const resolved = contactForCity(city, cfg, numbers);
      out[city] = { name: cfg.contact_name || '', phone: cfg.contact_phone || '', resolved, has_config: rows.length > 0 };
    }
    return out;
  }

  // vale para todas as cidades (a chave Pix e o recebedor continuam por cidade em Configurações)
  app.put('/api/billing-isis/config', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const mode = MODES.includes(req.body?.mode) ? req.body.mode : null;
      const fee = req.body?.card_fee_percent === undefined ? null : Math.min(Math.max(Number(req.body.card_fee_percent) || 0, 0), 30);
      const sets = [];
      const params = [];
      const contactUpdates = [];
      if (mode) { params.push(mode); sets.push(`isis_mode = $${params.length}`); }
      if (fee !== null) { params.push(fee); sets.push(`card_fee_percent = $${params.length}`); }
      // InfiniteTag de cada cidade (pública, não é senha; cada cidade recebe na sua conta): na linha da cidade
      for (const city of ['uruacu', 'minacu']) {
        const tag = req.body?.infinitepay_handles?.[city];
        if (typeof tag !== 'string') continue;
        const cfg = await paymentConfigFor(city);
        if (!cfg?.id || cityOf(cfg) !== city) continue;
        contactUpdates.push(pool.query(`UPDATE payment_config SET infinitepay_handle = $2 WHERE id = $1`,
          [cfg.id, tag.trim().replace(/^\$/, '').replace(/\s+/g, '').slice(0, 60) || null]));
      }
      // rodapé: igual ao padrão = guarda vazio (null); texto vazio = sem rodapé
      if (typeof req.body?.footer === 'string') {
        const f = req.body.footer.trim();
        params.push(f === DEFAULT_FOOTER ? null : f.slice(0, 500));
        sets.push(`msg_isis_rodape = $${params.length}`);
      }
      for (const step of TEMPLATE_STEPS) {
        const t = req.body?.templates?.[step];
        if (typeof t !== 'string') continue;
        // igual ao texto aprovado = guarda vazio (assim melhoria futura do padrão chega sozinha)
        params.push(t.trim() === DEFAULT_TEMPLATES[step] ? null : t.trim().slice(0, 3000));
        sets.push(`${TEMPLATE_COLUMNS[step]} = $${params.length}`);
      }
      // contato por cidade: grava na linha da cidade (a mesma que paymentConfigFor devolve para ela)
      for (const city of ['uruacu', 'minacu']) {
        const c = req.body?.contacts?.[city];
        if (!c || typeof c !== 'object') continue;
        const cfg = await paymentConfigFor(city);
        if (!cfg?.id) continue;
        contactUpdates.push(pool.query(
          `UPDATE payment_config SET contact_name = $2, contact_phone = $3 WHERE id = $1`,
          [cfg.id, String(c.name || '').trim().slice(0, 60) || null, String(c.phone || '').replace(/[^\d+() -]/g, '').trim().slice(0, 25) || null]
        ));
      }
      if (!sets.length && !contactUpdates.length) throw httpError(400, 'Nada para salvar');
      if (sets.length) await pool.query(`UPDATE payment_config SET ${sets.join(', ')}`, params);
      await Promise.all(contactUpdates);
      res.json({ success: true });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/billing-isis/agenda', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : todayBr().slice(0, 7);
      const today = todayBr();
      const { rows: sent } = await pool.query(
        `SELECT id, client_id, message_type, status, body, pdf_url, sent_at FROM billing_messages WHERE reference_month = $1 ORDER BY sent_at`, [month]
      );
      const items = [];
      for (const contract of await activeContracts()) {
        const config = await paymentConfigFor(contract.city || contract.client_city);
        const { dueDate, amount, paid } = await monthRevenue(contract, month);
        const dates = stepDates(dueDate);
        items.push({
          contract_id: contract.id,
          client_id: contract.client_id,
          client: String(contract.company_name || '').trim(),
          plan: contract.plan_name || null,
          amount,
          due_date: dueDate,
          paid,
          has_whatsapp: !!contract.whatsapp,
          billing_enabled: contract.billing_enabled !== false,
          mode: modeOf(config),
          steps: BILLING_STEPS.map((step) => {
            const msg = sent.filter((m) => m.client_id === contract.client_id && m.message_type === step).pop();
            const date = dates[step];
            const status = msg ? msg.status
              : paid && step !== 'relatorio_mensal' && step !== 'pre_vencimento' ? 'pago'
                : date < today ? 'passou' : 'previsto';
            return { step, date, status, body: msg?.body || null, pdf_url: msg?.pdf_url || null };
          }),
        });
      }
      res.json({ month, today, items });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/billing-isis/preview', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const step = BILLING_STEPS.includes(req.query.step) ? req.query.step : null;
      if (!step) throw httpError(400, 'Etapa inválida');
      const contract = (await activeContracts()).find((c) => c.id === req.query.contract_id);
      if (!contract) throw httpError(404, 'Contrato não encontrado');
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : todayBr();
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : date.slice(0, 7);
      const out = await compose(contract, step, date, month);
      // ?pdf=1: o PDF que sairia, gerado na hora e não guardado
      if (String(req.query.pdf || '') === '1') {
        if (!out.pdf) throw httpError(409, out.skip === 'aguardando_relatorio' ? 'Relatório do mês ainda não aprovado' : out.skip === 'pago' ? 'Mensalidade paga: não sai cobrança' : out.skip === 'conferir' ? `Não bate com o Financeiro: ${out.problems.join('; ')}` : 'Sem PDF para esta etapa');
        const buffer = await renderPdf(out.pdf);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${step}-${month}.pdf"` });
        return res.send(buffer);
      }
      res.json({
        step, date, skip: out.skip || null, problems: out.problems || null, body: out.body || null, contact: out.contact || null,
        pix_message: out.pixMessage || null, pay_url: out.payUrl || null,
      });
    } catch (error) { sendError(res, error); }
  });

  // ── página pública de pagamento (/pagar/<token>), sem login: valor, vencimento, Pix copia e cola e o checkout ──
  app.get('/api/public/cobranca/:token', async (req, res) => {
    try {
      const token = String(req.params.token || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw httpError(404, 'Cobrança não encontrada');
      await ensureSchema();
      const { rows: [p] } = await pool.query(`SELECT * FROM billing_pay_pages WHERE token = $1`, [token]);
      if (!p) throw httpError(404, 'Cobrança não encontrada');
      // pago agora? (o webhook da InfinitePay ou o financeiro baixam a receita)
      const { rows: [rev] } = p.revenue_id
        ? await pool.query(`SELECT status, paid_at FROM revenues WHERE id = $1`, [p.revenue_id]).catch(() => ({ rows: [] }))
        : { rows: [] };
      const paid = ['recebida', 'pago'].includes(rev?.status);
      res.set('Cache-Control', 'no-store');
      res.json({
        client: p.client_name, plan: p.plan_name, month: p.month, amount: Number(p.amount),
        due_date: p.due_date ? String(p.due_date instanceof Date ? p.due_date.toISOString() : p.due_date).slice(0, 10) : null,
        paid, paid_at: paid ? rev.paid_at : null,
        pix_payload: paid ? null : p.pix_payload, pix_key: p.pix_key, receiver: p.receiver_name,
        card_link: paid ? null : p.card_link, city: p.city,
      });
    } catch (error) { sendError(res, error); }
  });

  // prévia do obrigado (texto que sairia) para a tela
  app.get('/api/billing-isis/thanks-preview', async (req, res) => {
    try {
      await verifyAdmin(req);
      await ensureSchema();
      const contract = (await activeContracts()).find((c) => c.id === req.query.contract_id) || (await activeContracts())[0];
      if (!contract) throw httpError(404, 'Sem contrato ativo');
      const config = await paymentConfigFor(contract.city || contract.client_city);
      const contact = contactForCity(contract.client_city || contract.city, config, await assistantNumbers());
      const amount = Number(contract.contract_value) || 0;
      const today = todayBr();
      const body = withFooter(applyTemplate(templateOf(config, 'obrigado'), {
        nome_cliente: String(contract.company_name || '').trim(), plano: contract.plan_name || 'plano mensal', valor: brl(amount),
        mes_ref: nomeMes(today.slice(0, 7)), data_pagamento: dataBr(today), recibo: 'Recibo em anexo.',
      }), config?.msg_isis_rodape, contact);
      res.json({ client: contract.company_name, body });
    } catch (error) { sendError(res, error); }
  });

  return { run, modeOf, ensureSchema, thankRevenue, sweepThanks };
}

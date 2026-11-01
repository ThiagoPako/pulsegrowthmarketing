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
import {
  BILLING_STEPS, MODES, DEFAULT_TEMPLATES, monthName, previousMonth, nextMonth, stepDates, attendanceTip,
  cardAmount, brl, pixPayload, applyTemplate, bulletList, DEFAULT_FOOTER, withFooter, footerText,
} from './lib/billingIsis.mjs';
import { renderPdf } from './lib/billingPdf.mjs';
import { contactForCity } from './lib/contactByCity.mjs';
import { enqueueWhatsApp } from './whatsapp/shared.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const pad2 = (n) => String(n).padStart(2, '0');
const TEMPLATE_COLUMNS = {
  relatorio_mensal: 'msg_isis_relatorio',
  pre_vencimento: 'msg_isis_pre',
  cobranca: 'msg_isis_cobranca',
  lembrete: 'msg_isis_lembrete',
};
const todayBr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dateKey = (v) => (!v ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const isPaid = (r) => r?.status === 'recebida' || r?.status === 'pago';
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const monthLabel = (month) => `${monthName(`${month}-01`)} de ${month.slice(0, 4)}`;
const DOC_NAMES = { relatorio_mensal: 'Relatorio', pre_vencimento: 'Agenda', cobranca: 'Cobranca', lembrete: 'Cobranca' };

export function registerBillingIsisRoutes(app, {
  pool, verifyAdmin, paymentConfigFor, socialReports, paymentLink = async () => null, uploadRoot, publicUploadsUrl,
  logger = console,
}) {
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
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS contact_name TEXT;
          ALTER TABLE payment_config ADD COLUMN IF NOT EXISTS contact_phone TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS pdf_url TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS body TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS reference_month TEXT;
          ALTER TABLE billing_messages ADD COLUMN IF NOT EXISTS contract_id UUID;
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

  const templateOf = (config, step) => (config?.[TEMPLATE_COLUMNS[step]] || '').trim() || DEFAULT_TEMPLATES[step];
  const modeOf = (config) => (MODES.includes(config?.isis_mode) ? config.isis_mode : 'desligado');

  async function activeContracts() {
    const { rows } = await pool.query(
      `SELECT fc.*, c.company_name, c.whatsapp, c.city AS client_city, p.name AS plan_name
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
      revenue: rows[0] || null,
      paid: rows.some(isPaid),
      dueDate: dateKey(rows[0]?.due_date) || `${month}-${pad2(day)}`,
      amount: Number(rows[0]?.amount ?? contract.contract_value) || 0,
    };
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
    };
    return { ...out, contact, pdf, body: withFooter(out.body, out.config?.msg_isis_rodape, contact) };
  }

  /** Gera o PDF e guarda em uploads/cobrancas/<cliente>/<mês>/; devolve { url, name }. */
  async function savePdf(contract, step, month, spec) {
    const buffer = await renderPdf(spec);
    const dir = path.resolve(uploadRoot, 'cobrancas', String(contract.client_id), month);
    await fs.mkdir(dir, { recursive: true });
    const file = `${step}-${Date.now()}.pdf`;
    await fs.writeFile(path.join(dir, file), buffer);
    const slug = String(contract.company_name || 'cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return {
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
      const tipos = n.deliveries.videos.by_type.map((t) => `${t.total} ${t.type}`).join(' · ');
      const rec = n.deliveries.recordings;
      const pdfRelatorio = {
        kind: 'relatorio',
        title: `Relatório de ${monthLabel(ref)}`,
        cards: [
          { label: 'Vídeos', value: n.deliveries.videos.total, highlight: true },
          { label: 'Artes', value: n.deliveries.arts.total },
          { label: 'Posts', value: n.deliveries.posts.total },
          { label: 'Gravações', value: rec.done },
        ],
        sections: [
          {
            title: 'O que entregamos',
            bullets: [
              tipos ? `Vídeos: ${tipos}` : '',
              n.deliveries.arts.total ? `${n.deliveries.arts.total} artes` : '',
              n.deliveries.posts.total ? `${n.deliveries.posts.total} posts publicados` : '',
              `${rec.done} gravações realizadas${rec.avg_videos_per_recording !== null ? `, média de ${rec.avg_videos_per_recording.toLocaleString('pt-BR')} vídeos por gravação` : ''}`,
            ].filter(Boolean),
          },
          ...(n.time.total_hours > 0 ? [{ title: 'Tempo dedicado', text: `${n.time.total_hours.toLocaleString('pt-BR')} horas no seu perfil: gravação ${n.time.recording_hours.toLocaleString('pt-BR')} h · edição ${n.time.editing_hours.toLocaleString('pt-BR')} h · design ${n.time.design_hours.toLocaleString('pt-BR')} h.` }] : []),
          ...(net ? [{ title: 'Rede social', text: net }] : []),
          ...(report.draft.suggestions ? [{ title: `Sugestões para ${monthName(`${month}-01`)}`, bullets: bulletList(report.draft.suggestions).split('\n') }] : []),
        ],
      };
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

    const { revenue, paid, dueDate, amount } = await monthRevenue(contract, month);
    if (step !== 'pre_vencimento' && paid) return { skip: 'pago', config };

    if (step === 'pre_vencimento') {
      const ref = previousMonth(`${month}-01`);
      const a = await attendance(contract.client_id, ref);
      return {
        config,
        pdf: {
          kind: 'agradecimento',
          title: `Obrigada pela parceria em ${monthName(`${ref}-01`)}!`,
          cards: [
            { label: 'Gravações feitas', value: `${a.done} de ${a.scheduled}`, highlight: true },
            { label: 'Vídeos por gravação', value: a.avg === null ? '—' : a.avg.toLocaleString('pt-BR') },
            { label: 'Próximo vencimento', value: dataBr(dueDate) },
          ],
          sections: [{ title: 'Como melhorar a entrega', text: attendanceTip(a) }],
        },
        body: applyTemplate(templateOf(config, step), {
          ...base, mes_ref: monthName(`${ref}-01`), gravacoes_feitas: a.done, gravacoes_marcadas: a.scheduled,
          media_videos: a.avg === null ? '' : a.avg.toLocaleString('pt-BR'),
          dica_assiduidade: attendanceTip(a), dia_vencimento: String(Number(dueDate.slice(8, 10))),
        }),
      };
    }

    const pix = pixPayload({ key: config?.pix_key, name: config?.receiver_name, city: contract.city || contract.client_city, amount, txid: `PULSE${month.replace('-', '')}` });
    const card = cardAmount(amount, config?.card_fee_percent);
    const link = await paymentLink({ contract, revenue, amount: card, month }).catch((error) => {
      logger.error('[cobranca-isis] link de pagamento:', error.message);
      return null;
    });
    const plano = contract.plan_name || 'plano mensal';
    return {
      config,
      revenue,
      pdf: {
        kind: 'cobranca',
        title: `Mensalidade de ${monthLabel(month)}`,
        status: step === 'lembrete' ? 'vencido' : 'aberto',
        cards: [
          { label: 'Cliente', value: String(contract.company_name || '').trim(), small: true },
          { label: 'Vencimento', value: dataBr(dueDate) },
          { label: 'Valor', value: brl(amount), highlight: true },
        ],
        table: {
          title: 'Serviços',
          columns: [{ label: 'Descrição', width: 287 }, { label: 'Competência', width: 120 }, { label: 'Valor', width: 100, align: 'right' }],
          rows: [[`Mensalidade ${plano}`, `${month.slice(5, 7)}/${month.slice(0, 4)}`, brl(amount)]],
          total: { label: 'Total', value: brl(amount) },
        },
        payment: { pixPayload: pix, pixKey: config?.pix_key, receiver: config?.receiver_name, cardLink: link, cardAmount: link ? brl(card) : null },
      },
      body: applyTemplate(templateOf(config, step), {
        ...base, plano, valor: brl(amount), mes_ref: monthName(`${month}-01`),
        pix_copia_cola: pix, chave_pix: config?.pix_key, nome_recebedor: config?.receiver_name,
        valor_cartao: link ? brl(card) : '', link_infinitepay: link,
      }),
    };
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
          if (out.skip) {
            // relatório ainda não aprovado: fica marcado (a agenda mostra) e não tenta de novo no mês
            await record(contract, step, month, out.skip === 'aguardando_relatorio' ? 'aguardando_relatorio' : 'pulado', null);
            continue;
          }
          // o PDF sai antes do envio e fica guardado (a agenda e a prévia mostram o mesmo arquivo)
          const pdf = out.pdf ? await savePdf(contract, step, month, out.pdf) : null;
          if (!contract.whatsapp) { await record(contract, step, month, 'sem_whatsapp', out.body, out.revenue?.id, pdf?.url); continue; }
          if (mode === 'previa') {
            await record(contract, step, month, 'previa', out.body, out.revenue?.id, pdf?.url);
          } else {
            await enqueueWhatsApp(pool, {
              to: contract.whatsapp, body: out.body, purpose: 'assistente', triggerType: 'cobranca', clientId: contract.client_id,
              ...(pdf ? { mediaUrl: pdf.url, mediaName: pdf.name } : {}),
            });
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
        infinitepay_handle: config?.infinitepay_handle || '',
        templates: Object.fromEntries(BILLING_STEPS.map((s) => [s, templateOf(config, s)])),
        defaults: DEFAULT_TEMPLATES,
        footer: config?.msg_isis_rodape ?? DEFAULT_FOOTER,
        default_footer: DEFAULT_FOOTER,
        // contato do rodapé por cidade (Uruaçu → Thiago, Minaçu → Victor; telefone do Assistente PULSE se vazio)
        contacts: await contactsByCity(),
      });
    } catch (error) { sendError(res, error); }
  });

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
      if (mode) { params.push(mode); sets.push(`isis_mode = $${params.length}`); }
      if (fee !== null) { params.push(fee); sets.push(`card_fee_percent = $${params.length}`); }
      // InfiniteTag (pública, não é senha): cadastrada pelo Thiago; a coluna nasce em infinitePayRoutes.mjs
      if (typeof req.body?.infinitepay_handle === 'string') {
        params.push(req.body.infinitepay_handle.trim().replace(/^\$/, '').replace(/\s+/g, '').slice(0, 60) || null);
        sets.push(`infinitepay_handle = $${params.length}`);
      }
      // rodapé: igual ao padrão = guarda vazio (null); texto vazio = sem rodapé
      if (typeof req.body?.footer === 'string') {
        const f = req.body.footer.trim();
        params.push(f === DEFAULT_FOOTER ? null : f.slice(0, 500));
        sets.push(`msg_isis_rodape = $${params.length}`);
      }
      for (const step of BILLING_STEPS) {
        const t = req.body?.templates?.[step];
        if (typeof t !== 'string') continue;
        // igual ao texto aprovado = guarda vazio (assim melhoria futura do padrão chega sozinha)
        params.push(t.trim() === DEFAULT_TEMPLATES[step] ? null : t.trim().slice(0, 3000));
        sets.push(`${TEMPLATE_COLUMNS[step]} = $${params.length}`);
      }
      // contato por cidade: grava na linha da cidade (a mesma que paymentConfigFor devolve para ela)
      const contactUpdates = [];
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
        if (!out.pdf) throw httpError(409, out.skip === 'aguardando_relatorio' ? 'Relatório do mês ainda não aprovado' : out.skip === 'pago' ? 'Mensalidade paga: não sai cobrança' : 'Sem PDF para esta etapa');
        const buffer = await renderPdf(out.pdf);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${step}-${month}.pdf"` });
        return res.send(buffer);
      }
      res.json({ step, date, skip: out.skip || null, body: out.body || null, contact: out.contact || null });
    } catch (error) { sendError(res, error); }
  });

  return { run, modeOf, ensureSchema };
}

// Temperatura do cliente — rotas da tela (Clientes → Temperatura). Login + papel de gestão (admin, social_media,
// gestor_projetos ou socio_gestor) e cidade ativa (resolveActiveCity: cada um só vê os clientes da cidade dele).
// Nenhuma resposta leva telefone, wa_id ou grupo: só notas, motivos, sinais e trechos já sem números.
//
//   GET  /api/client-temperature                 clientes da cidade com a última nota, tendência, série e motivo
//   GET  /api/client-temperature/:id             detalhe: histórico, sinais de dados, leituras do grupo, alertas
//   POST /api/client-temperature/:id/refresh     "Atualizar agora" (1 vez a cada 10 min por cliente, 20 por hora por pessoa)

import { cityExpr, addDays, brazilToday } from './common.mjs';
import { isUuid } from './actions.mjs';

const ROLES = ['admin', 'social_media', 'gestor_projetos', 'socio_gestor'];
// valor da inadimplência: só para quem vê o financeiro (o resto vê parcelas e dias)
const FINANCE_ROLES = ['admin', 'socio_gestor'];
const CLIENT_COOLDOWN_MS = 10 * 60_000;
const USER_LIMIT_PER_HOUR = 20;
const httpError = (status, message) => Object.assign(new Error(message), { status });

export function registerTemperatureRoutes(app, { pool, temperature, verifyUser, userHasAnyRole, resolveActiveCity }) {
  async function manager(req) {
    const { user } = await verifyUser(req);
    if (!(await userHasAnyRole(user, ROLES))) throw httpError(403, 'Acesso restrito à gestão');
    const city = await resolveActiveCity(req, user.id, user);
    await temperature.ensureSchema();
    return { user, city, finance: await userHasAnyRole(user, FINANCE_ROLES) };
  }

  const fail = (res, error) => {
    const status = error.status || error.statusCode || (/Unauthorized|token/i.test(error.message) ? 401 : 500);
    if (status >= 500) console.error('[temperatura] rota:', error);
    res.status(status).json({ error: status >= 500 ? 'Falha ao carregar a temperatura' : error.message });
  };

  // cliente visível na cidade ativa (cidade vazia vale Minaçu, como no PULSE); cliente da agência e cancelado ficam de fora
  const VISIBLE = (alias, param) => `NOT coalesce(${alias}.is_admin_client, false) AND ${alias}.status IS DISTINCT FROM 'cancelado'
    AND ${cityExpr(`${alias}.city`)} = ${param}`;

  async function clientInCity(id, city) {
    if (!isUuid(id)) throw httpError(404, 'Cliente não encontrado');
    const { rows } = await pool.query(
      `SELECT c.id, c.company_name, c.logo_url, c.color, ${cityExpr('c.city')} AS cidade,
              (c.whatsapp_group IS NOT NULL AND btrim(c.whatsapp_group) <> '') AS tem_grupo
         FROM clients c WHERE c.id = $1 AND ${VISIBLE('c', '$2')}`,
      [id, city]
    );
    if (!rows.length) throw httpError(404, 'Cliente não encontrado');
    return rows[0];
  }

  function publicSignals(s, finance) {
    const out = { ...(s || {}) };
    if (out.inadimplencia && !finance) out.inadimplencia = { parcelas: out.inadimplencia.parcelas, maxDias: out.inadimplencia.maxDias };
    return out;
  }

  async function detail(client, { finance }) {
    const today = brazilToday();
    const [current, history, readings, alerts] = await Promise.all([
      pool.query(`SELECT * FROM client_temperature WHERE client_id = $1 ORDER BY dia DESC LIMIT 1`, [client.id]),
      pool.query(
        `SELECT dia::text AS dia, nota, nota_dados, nota_conversa FROM client_temperature
          WHERE client_id = $1 AND dia >= $2::date ORDER BY dia`, [client.id, addDays(today, -90)]),
      pool.query(
        `SELECT id, fonte, mensagens, nota, sinais, trechos, resumo, created_at FROM client_temperature_readings
          WHERE client_id = $1 ORDER BY created_at DESC LIMIT 12`, [client.id]),
      pool.query(
        `SELECT id, motivo, nota, notificado, whatsapp, created_at FROM client_temperature_alerts
          WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`, [client.id]),
    ]);
    const row = current.rows[0];
    return {
      client: { id: client.id, company_name: client.company_name, logo_url: client.logo_url, color: client.color, cidade: client.cidade, tem_grupo: client.tem_grupo },
      atual: row ? {
        dia: row.dia instanceof Date ? row.dia.toISOString().slice(0, 10) : String(row.dia).slice(0, 10),
        nota: row.nota, faixa: row.faixa, nota_dados: row.nota_dados, nota_conversa: row.nota_conversa, variacao: row.variacao,
        motivos: row.motivos || [], trechos: row.trechos || [], sinais: publicSignals(row.sinais, finance), resumo: row.resumo,
        fonte: row.fonte, analisado_em: row.analisado_em,
      } : null,
      historico: history.rows,
      conversas: readings.rows,
      alertas: alerts.rows,
    };
  }

  app.get('/api/client-temperature', async (req, res) => {
    try {
      const { city } = await manager(req);
      const today = brazilToday();
      const { rows } = await pool.query(
        `WITH ult AS (
           SELECT DISTINCT ON (client_id) client_id, dia, nota, faixa, variacao, motivos, analisado_em, nota_dados, nota_conversa
             FROM client_temperature WHERE dia >= $2::date ORDER BY client_id, dia DESC
         )
         SELECT c.id, c.company_name, c.logo_url, c.color,
                (c.whatsapp_group IS NOT NULL AND btrim(c.whatsapp_group) <> '') AS tem_grupo,
                u.dia::text AS dia, u.nota, u.faixa, u.variacao, u.motivos, u.analisado_em, u.nota_dados, u.nota_conversa,
                (SELECT coalesce(json_agg(t.nota ORDER BY t.dia), '[]'::json) FROM client_temperature t
                  WHERE t.client_id = c.id AND t.dia >= $3::date) AS serie
           FROM clients c LEFT JOIN ult u ON u.client_id = c.id
          WHERE ${VISIBLE('c', '$1')}
          ORDER BY u.nota ASC NULLS LAST, c.company_name`,
        [city, addDays(today, -30), addDays(today, -13)]
      );
      res.json({
        cidade: city,
        clientes: rows.map((r) => ({
          client_id: r.id, company_name: r.company_name, logo_url: r.logo_url, color: r.color, tem_grupo: r.tem_grupo,
          nota: r.nota, faixa: r.faixa, variacao: r.variacao, motivo: (r.motivos || [])[0]?.texto || null,
          analisado_em: r.analisado_em, dia: r.dia, nota_dados: r.nota_dados, nota_conversa: r.nota_conversa, serie: r.serie || [],
        })),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get('/api/client-temperature/:id', async (req, res) => {
    try {
      const { city, finance } = await manager(req);
      res.json(await detail(await clientInCity(req.params.id, city), { finance }));
    } catch (error) {
      fail(res, error);
    }
  });

  const clientCooldown = new Map();
  const userHits = new Map();
  app.post('/api/client-temperature/:id/refresh', async (req, res) => {
    try {
      const { user, city, finance } = await manager(req);
      const client = await clientInCity(req.params.id, city);
      const now = Date.now();
      const hits = (userHits.get(user.id) || []).filter((t) => now - t < 3_600_000);
      if (hits.length >= USER_LIMIT_PER_HOUR) throw httpError(429, 'Limite de atualizações por hora atingido. Tente mais tarde.');
      const last = clientCooldown.get(client.id) || 0;
      if (now - last < CLIENT_COOLDOWN_MS) {
        const minutes = Math.ceil((CLIENT_COOLDOWN_MS - (now - last)) / 60_000);
        throw httpError(429, `Atualizado há pouco. Tente de novo em ${minutes} min.`);
      }
      clientCooldown.set(client.id, now);
      userHits.set(user.id, [...hits, now]);
      await temperature.refreshClient(client.id, { fonte: 'manual', analyze: true });
      res.json(await detail(client, { finance }));
    } catch (error) {
      fail(res, error);
    }
  });
}

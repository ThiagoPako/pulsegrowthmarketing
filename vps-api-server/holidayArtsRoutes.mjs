// ─── Aviso da manhã das artes de feriado (Ísis, pedido do usuário, 01/11/2026) ─────────────────────────────────
//   GET /api/agent/holiday-arts?days=10[&city=minacu]   (social_media, chefe) feriados dos próximos dias, clientes sem
//        card e cards abertos, e o recado pronto (pulse feriados; a Ísis manda com whatsapp equipe). Com city, só os
//        clientes daquela cidade (o Victor só recebe Minaçu; usuário, 01/11/2026); cliente sem cidade conta como Minaçu.

import { upcomingHolidays, holidayStatus, morningMessage } from './lib/holidayArts.mjs';
import { normalizeCityValue } from './lib/cityResolution.mjs';

const CITY_LABELS = { minacu: 'Minaçu', uruacu: 'Uruaçu' };

export function registerHolidayArtsRoutes(app, { pool, agentApi, logger = console }) {
  app.get('/api/agent/holiday-arts', async (req, res) => {
    try {
      const agent = await agentApi.verifyAgent(req);
      if (!['social_media', 'chefe'].includes(agent.role)) {
        return res.status(403).json({ error: 'Só a social media e a chefe' });
      }
      const days = Math.min(Math.max(Number(req.query.days) || 10, 1), 45);
      const city = normalizeCityValue(req.query.city);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const holidays = upcomingHolidays(today, days);
      if (!holidays.length) return res.json({ today, days, city, holidays: [], message: null });
      const [{ rows: all }, { rows: tasks }] = await Promise.all([
        pool.query(`SELECT id, company_name, city FROM clients WHERE coalesce(status, 'ativo') NOT IN ('cancelado', 'inativo') ORDER BY company_name`),
        pool.query(`SELECT client_id, title, kanban_column FROM design_tasks WHERE title LIKE 'Aviso de feriado · %'`),
      ]);
      const clients = city ? all.filter((c) => (normalizeCityValue(c.city) || 'minacu') === city) : all;
      const status = holidayStatus(holidays, clients, tasks);
      res.json({ today, days, city, holidays: status, message: morningMessage(status, { city: city ? (CITY_LABELS[city] || city) : null }) });
    } catch (error) {
      const status = error?.status || (error?.message === 'Unauthorized' ? 401 : 500);
      if (status >= 500) logger.error('[feriados] erro:', error);
      res.status(status).json({ error: error?.message || 'Erro' });
    }
  });
}

// ─── Logo dos clientes pelos agentes (usuário, 02/11/2026) ──────────────────────────────────────────────────────────
// "Manutenção do sistema é responsabilidade do Severino: se tem cliente sem logo, ele tem acesso ao Drive, e se a logo do
// Drive não der certo para colocar no tamanho, ele pede à Nina para fazer uma." Onde aparece o nome do cliente aparece a
// logo (ClientLogo), então cliente sem logo — ou com o link antigo do Supabase, que não abre mais — é pendência.
//   GET  /api/agent/clients/missing-logos      (triagem, chefe, designer) clientes ativos sem logo que abre
//   POST /api/agent/clients/:id/logo           (triagem, chefe, designer) corpo = a imagem (png, jpg ou webp, até 5 MB)

import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const ROLES = new Set(['triagem', 'chefe', 'designer']);

/** Link que não abre mais: vazio ou do Supabase antigo (o storage foi desligado). */
export const logoMissing = (url) => !String(url || '').trim() || /supabase\.co\//i.test(String(url));

export function registerAgentClientLogoRoutes(app, { pool, verifyAgent, uploadRoot, appBase = 'https://agenciapulse.tech', logger = console }) {
  const fail = (res, error) => {
    const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
    if (status >= 500) logger.error('[logo do cliente]', error?.message);
    res.status(status).json({ error: error?.message || 'Erro' });
  };
  const allowed = async (req) => {
    const agent = await verifyAgent(req);
    if (!ROLES.has(agent.role)) throw Object.assign(new Error('Só o Severino, a chefe e as designers mexem na logo do cliente'), { status: 403 });
    return agent;
  };

  app.get('/api/agent/clients/missing-logos', async (req, res) => {
    try {
      await allowed(req);
      const { rows } = await pool.query(
        `SELECT id, company_name, city, logo_url FROM clients WHERE coalesce(status, 'ativo') <> 'inativo' AND company_name NOT ILIKE '%teste%' ORDER BY company_name`
      );
      res.json({ clients: rows.filter((c) => logoMissing(c.logo_url)).map((c) => ({ id: c.id, name: String(c.company_name || '').trim(), city: c.city, motivo: c.logo_url ? 'link antigo que não abre' : 'sem logo' })) });
    } catch (error) { fail(res, error); }
  });

  app.post('/api/agent/clients/:id/logo', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '5mb' }), async (req, res) => {
    try {
      const agent = await allowed(req);
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!EXT[type] || !Buffer.isBuffer(req.body) || req.body.length < 500) throw Object.assign(new Error('Mande a imagem da logo (png, jpg ou webp)'), { status: 400 });
      const { rows: [c] } = await pool.query(`SELECT id, company_name FROM clients WHERE id = $1`, [req.params.id]);
      if (!c) throw Object.assign(new Error('Cliente não encontrado'), { status: 404 });
      const dir = path.join(uploadRoot, 'logos');
      await fs.mkdir(dir, { recursive: true });
      const name = `${c.id}-${Date.now()}.${EXT[type]}`;
      await fs.writeFile(path.join(dir, name), req.body);
      const url = `${appBase}/uploads/logos/${name}`;
      await pool.query(`UPDATE clients SET logo_url = $2, updated_at = now() WHERE id = $1`, [c.id, url]).catch(async () => {
        await pool.query(`UPDATE clients SET logo_url = $2 WHERE id = $1`, [c.id, url]);
      });
      logger.log?.(`[logo do cliente] ${String(c.company_name).trim()} ← ${agent.name || agent.role}`);
      res.json({ ok: true, url });
    } catch (error) { fail(res, error); }
  });
}

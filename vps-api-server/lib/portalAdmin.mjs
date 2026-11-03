// ─── Admin da empresa no portal do cliente (pedido do usuário, 03/11/2026) ──────────────────────────────────────────
// "Preciso de um link para enviar para o cliente admin da empresa; com ele, ele vai ter acesso ao portal do cliente no
// formato admin." A equipe gera um convite de uso único (vale 7 dias); quem abre cria o login (ou entra com o que já
// tem) e vira admin da empresa no portal: vê quem tem acesso, tira acessos, promove outro admin e copia o link de
// cadastro dos colaboradores. O papel é conferido no banco a cada ação (não no token), então tirar o admin vale na hora.

import crypto from 'node:crypto';

export const PORTAL_ROLES = ['admin', 'membro'];
const INVITE_DAYS = 7;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function createPortalAdmin({ pool }) {
  let ready = null;
  function ensureSchema() {
    ready ||= (async () => {
      await pool.query(`ALTER TABLE client_portal_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'membro'`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_portal_invites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'admin',
          created_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          used_by UUID
        )`);
    })().catch((error) => { ready = null; throw error; });
    return ready;
  }

  /** Convite novo (o anterior ainda não usado do mesmo cliente deixa de valer). Devolve o token, que só sai aqui. */
  async function createInvite({ clientId, createdBy = null, role = 'admin' }) {
    await ensureSchema();
    if (!PORTAL_ROLES.includes(role)) throw new Error('papel inválido');
    await pool.query(`UPDATE client_portal_invites SET expires_at = now() WHERE client_id = $1 AND role = $2 AND used_at IS NULL AND expires_at > now()`, [clientId, role]);
    const token = crypto.randomBytes(24).toString('base64url');
    const { rows: [row] } = await pool.query(
      `INSERT INTO client_portal_invites (client_id, token_hash, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval) RETURNING expires_at`,
      [clientId, hashToken(token), role, createdBy, String(INVITE_DAYS)]
    );
    return { token, expires_at: row.expires_at };
  }

  /** O convite ainda vale para este cliente? { role, expires_at } ou null. */
  async function inviteInfo(token, clientId) {
    if (!token) return null;
    await ensureSchema();
    const { rows: [row] } = await pool.query(
      `SELECT role, expires_at FROM client_portal_invites
        WHERE token_hash = $1 AND client_id = $2 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(token), clientId]
    );
    return row || null;
  }

  /** Usa o convite (uma vez só) e dá o papel ao login. Devolve o papel ou null se o convite não vale. */
  async function consumeInvite(token, clientId, portalUserId) {
    if (!token || !portalUserId) return null;
    await ensureSchema();
    const { rows: [row] } = await pool.query(
      `UPDATE client_portal_invites SET used_at = now(), used_by = $3
        WHERE token_hash = $1 AND client_id = $2 AND used_at IS NULL AND expires_at > now() RETURNING role`,
      [hashToken(token), clientId, portalUserId]
    );
    if (!row) return null;
    await pool.query(`UPDATE client_portal_users SET role = $1 WHERE id = $2 AND client_id = $3`, [row.role, portalUserId, clientId]);
    return row.role;
  }

  async function roleOf(portalUserId, clientId) {
    if (!portalUserId) return null;
    await ensureSchema();
    const { rows: [row] } = await pool.query(`SELECT role FROM client_portal_users WHERE id = $1 AND client_id = $2`, [portalUserId, clientId]);
    return row?.role || null;
  }

  async function listUsers(clientId) {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, username, display_name, role, created_at FROM client_portal_users WHERE client_id = $1 ORDER BY role = 'admin' DESC, created_at`,
      [clientId]
    );
    return rows;
  }

  async function adminCount(clientId) {
    const { rows: [{ n }] } = await pool.query(`SELECT count(*)::int AS n FROM client_portal_users WHERE client_id = $1 AND role = 'admin'`, [clientId]);
    return n;
  }

  /** Muda o papel de um login da empresa. A empresa nunca fica sem admin quando já tem um. */
  async function setRole(clientId, userId, role) {
    await ensureSchema();
    if (!PORTAL_ROLES.includes(role)) return { error: 'Papel inválido' };
    const current = await roleOf(userId, clientId);
    if (!current) return { error: 'Login não encontrado' };
    if (current === 'admin' && role !== 'admin' && (await adminCount(clientId)) <= 1) return { error: 'A empresa precisa de pelo menos um admin' };
    await pool.query(`UPDATE client_portal_users SET role = $1 WHERE id = $2 AND client_id = $3`, [role, userId, clientId]);
    return { ok: true };
  }

  /** Tira o acesso de um login da empresa (o admin não tira o próprio, nem o último admin). */
  async function removeUser(clientId, userId, actingUserId = null) {
    await ensureSchema();
    if (actingUserId && userId === actingUserId) return { error: 'Você não pode tirar o seu próprio acesso' };
    const current = await roleOf(userId, clientId);
    if (!current) return { error: 'Login não encontrado' };
    if (current === 'admin' && (await adminCount(clientId)) <= 1) return { error: 'A empresa precisa de pelo menos um admin' };
    await pool.query(`DELETE FROM client_portal_users WHERE id = $1 AND client_id = $2`, [userId, clientId]);
    return { ok: true };
  }

  return { ensureSchema, createInvite, inviteInfo, consumeInvite, roleOf, listUsers, setRole, removeUser };
}

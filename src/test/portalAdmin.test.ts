import { describe, expect, it } from 'vitest';
import { createPortalAdmin } from '../../vps-api-server/lib/portalAdmin.mjs';

const C = '11111111-1111-4111-8111-111111111111';

// banco de mentira: só o que o portalAdmin usa (logins, convites)
function fakePool() {
  const users = [
    { id: 'a', client_id: C, role: 'admin' },
    { id: 'b', client_id: C, role: 'membro' },
  ];
  const links: { id: string; client_id: string; token: string; revoked: boolean }[] = [];
  const invites: { token_hash: string; client_id: string; role: string; used_at: string | null; expires: number }[] = [];
  const query = async (sql: string, p: unknown[] = []) => {
    if (/^\s*(ALTER|CREATE)/.test(sql)) return { rows: [] };
    if (sql.includes('UPDATE client_portal_admin_links SET revoked_at')) { links.filter((l) => l.client_id === p[0]).forEach((l) => { l.revoked = true; }); return { rows: [] }; }
    if (sql.includes('INSERT INTO client_portal_admin_links')) { links.push({ id: `l${links.length}`, client_id: p[0] as string, token: p[1] as string, revoked: false }); return { rows: [] }; }
    if (sql.includes('SELECT token FROM client_portal_admin_links')) return { rows: links.filter((l) => l.client_id === p[0] && !l.revoked).slice(-1) };
    if (sql.includes('SELECT id, client_id FROM client_portal_admin_links')) return { rows: links.filter((l) => l.token === p[0] && !l.revoked) };
    if (sql.includes('FROM client_portal_admin_links WHERE id')) return { rows: links.filter((l) => l.id === p[0] && l.client_id === p[1] && !l.revoked).map(() => ({})) };
    if (sql.includes('UPDATE client_portal_invites SET expires_at = now()')) {
      invites.filter((i) => i.client_id === p[0] && !i.used_at).forEach((i) => { i.expires = 0; });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO client_portal_invites')) {
      invites.push({ client_id: p[0] as string, token_hash: p[1] as string, role: p[2] as string, used_at: null, expires: Date.now() + 7 * 864e5 });
      return { rows: [{ expires_at: new Date() }] };
    }
    if (sql.includes('UPDATE client_portal_invites SET used_at')) {
      const i = invites.find((x) => x.token_hash === p[0] && x.client_id === p[1] && !x.used_at && x.expires > Date.now());
      if (!i) return { rows: [] };
      i.used_at = 'now';
      return { rows: [{ role: i.role }] };
    }
    if (sql.includes('FROM client_portal_invites')) {
      const i = invites.find((x) => x.token_hash === p[0] && x.client_id === p[1] && !x.used_at && x.expires > Date.now());
      return { rows: i ? [{ role: i.role, expires_at: new Date(i.expires) }] : [] };
    }
    if (sql.includes('UPDATE client_portal_users SET role')) {
      const u = users.find((x) => x.id === p[1] && x.client_id === p[2]);
      if (u) u.role = p[0] as string;
      return { rows: [] };
    }
    if (sql.includes('SELECT role FROM client_portal_users')) {
      const u = users.find((x) => x.id === p[0] && x.client_id === p[1]);
      return { rows: u ? [{ role: u.role }] : [] };
    }
    if (sql.includes("role = 'admin'") && sql.includes('count(*)')) return { rows: [{ n: users.filter((x) => x.client_id === p[0] && x.role === 'admin').length }] };
    if (sql.includes('DELETE FROM client_portal_users')) {
      const k = users.findIndex((x) => x.id === p[0]);
      if (k >= 0) users.splice(k, 1);
      return { rows: [] };
    }
    throw new Error(`SQL não previsto: ${sql}`);
  };
  return { pool: { query }, users };
}

describe('admin da empresa no portal', () => {
  it('convite de admin vale uma vez só, só na empresa dele, e dá o papel de admin', async () => {
    const { pool, users } = fakePool();
    const adm = createPortalAdmin({ pool });
    const { token } = await adm.createInvite({ clientId: C });
    expect(await adm.inviteInfo(token, C)).toMatchObject({ role: 'admin' });
    expect(await adm.inviteInfo(token, '22222222-2222-4222-8222-222222222222')).toBeNull();
    expect(await adm.consumeInvite(token, C, 'b')).toBe('admin');
    expect(users.find((u) => u.id === 'b')?.role).toBe('admin');
    expect(await adm.consumeInvite(token, C, 'b')).toBeNull(); // já usado
  });

  it('um convite novo cancela o anterior', async () => {
    const { pool } = fakePool();
    const adm = createPortalAdmin({ pool });
    const first = await adm.createInvite({ clientId: C });
    await adm.createInvite({ clientId: C });
    expect(await adm.inviteInfo(first.token, C)).toBeNull();
  });

  it('a empresa nunca fica sem admin e ninguém tira o próprio acesso', async () => {
    const { pool, users } = fakePool();
    const adm = createPortalAdmin({ pool });
    expect(await adm.setRole(C, 'a', 'membro')).toMatchObject({ error: expect.stringMatching(/pelo menos um admin/) });
    expect(await adm.removeUser(C, 'a', 'a')).toMatchObject({ error: expect.stringMatching(/próprio acesso/) });
    expect(await adm.removeUser(C, 'a', null)).toMatchObject({ error: expect.stringMatching(/pelo menos um admin/) });
    expect(await adm.removeUser(C, 'b', 'a')).toEqual({ ok: true });
    expect(users.map((u) => u.id)).toEqual(['a']);
    expect(await adm.setRole(C, 'a', 'chefe')).toMatchObject({ error: 'Papel inválido' });
  });

  it('link fixo de admin: o mesmo a cada cópia, e trocar desliga o antigo e as sessões dele', async () => {
    const { pool } = fakePool();
    const adm = createPortalAdmin({ pool });
    const t1 = await adm.adminLink(C);
    expect(await adm.adminLink(C)).toBe(t1);
    const l1 = await adm.adminLinkByToken(t1);
    expect(l1).toMatchObject({ client_id: C });
    expect(await adm.adminLinkActive(l1!.id, C)).toBe(true);
    const t2 = await adm.adminLink(C, { renew: true });
    expect(t2).not.toBe(t1);
    expect(await adm.adminLinkByToken(t1)).toBeNull();
    expect(await adm.adminLinkActive(l1!.id, C)).toBe(false);
    expect(await adm.adminLinkByToken('curto')).toBeNull();
  });
});

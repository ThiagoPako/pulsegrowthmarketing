import { describe, it, expect } from 'vitest';
import {
  createPortalSession,
  effectiveClientId,
  itemScopeClientId,
} from '../../vps-api-server/lib/portalSession.mjs';

// jwt de mentira: guarda o payload em JSON e confere o segredo (o suficiente para a lógica do módulo)
const fakeJwt = {
  sign: (payload: Record<string, unknown>, secret: string) => `${secret}|${JSON.stringify(payload)}`,
  verify: (token: string, secret: string) => {
    const [tokenSecret, json] = token.split('|');
    if (tokenSecret !== secret) throw new Error('invalid signature');
    return JSON.parse(json);
  },
};

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

describe('sessão do portal', () => {
  const session = createPortalSession({ jwt: fakeJwt, secret: 'portal-secret' });

  it('assina e lê o token do cliente', () => {
    const token = session.sign({ clientId: CLIENT_A, portalUserId: 'u1' });
    expect(session.read(token)).toEqual({ clientId: CLIENT_A, portalUserId: 'u1' });
  });

  it('recusa token com outro segredo, sem typ portal ou com sub (JWT da equipe)', () => {
    expect(session.read(`team-secret|${JSON.stringify({ typ: 'portal', cid: CLIENT_A })}`)).toBeNull();
    expect(session.read(`portal-secret|${JSON.stringify({ cid: CLIENT_A })}`)).toBeNull();
    expect(session.read(`portal-secret|${JSON.stringify({ typ: 'portal', cid: CLIENT_A, sub: 'x' })}`)).toBeNull();
    expect(session.read(undefined as unknown as string)).toBeNull();
  });

  it('não assina token para client_id inválido', () => {
    expect(() => session.sign({ clientId: 'nome-da-empresa' })).toThrow();
  });

  it('equipe com JWT válido tem prioridade sobre o token do portal', async () => {
    const req = { headers: { authorization: 'Bearer equipe', 'x-portal-token': session.sign({ clientId: CLIENT_A }) } };
    const caller = await session.resolveCaller(req, async () => ({ user: { id: 'u-team', role: 'social_media' } }));
    expect(caller?.kind).toBe('team');
  });

  it('JWT da equipe inválido cai para o token do portal', async () => {
    const req = { headers: { authorization: 'Bearer velho', 'x-portal-token': session.sign({ clientId: CLIENT_A }) } };
    const caller = await session.resolveCaller(req, async () => { throw new Error('Unauthorized'); });
    expect(caller).toEqual({ kind: 'client', clientId: CLIENT_A, portalUserId: null });
  });

  it('sem nenhuma sessão devolve null', async () => {
    expect(await session.resolveCaller({ headers: {} }, async () => ({ user: null }))).toBeNull();
  });
});

describe('client_id usado pelas ações do portal', () => {
  const clientCaller = { kind: 'client', clientId: CLIENT_A };
  const teamCaller = { kind: 'team', user: { id: 'u' }, clientId: null };

  it('cliente sempre usa o client_id do token, mesmo mandando outro no corpo', () => {
    expect(effectiveClientId(clientCaller, CLIENT_B)).toBe(CLIENT_A);
    expect(itemScopeClientId(clientCaller, CLIENT_B)).toBe(CLIENT_A);
  });

  it('equipe usa o do corpo; sem client_id válido não filtra o item', () => {
    expect(effectiveClientId(teamCaller, 'nome-da-empresa')).toBe('nome-da-empresa');
    expect(itemScopeClientId(teamCaller, CLIENT_B)).toBe(CLIENT_B);
    expect(itemScopeClientId(teamCaller, undefined)).toBeNull();
    expect(itemScopeClientId(teamCaller, 'nome-da-empresa')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { createFlows, fillVars, matchesTrigger, normalizeFlow } from '../../vps-api-server/lib/socialFlows.mjs';

const flowBody = {
  name: 'Captura', trigger: { type: 'comment_keyword', keywords: ['EU QUERO'], post_ids: [] }, public_reply: 'Te mandei no direct!',
  steps: [
    { id: 'a', text: 'Oi {primeiro_nome}! Quer que a gente te chame?', buttons: [], replies: [{ title: 'Sim', next: 'b' }, { title: 'Agora não', next: 'd' }] },
    { id: 'b', text: 'Manda seu WhatsApp', buttons: [], replies: [], ask: { field: 'telefone', next: 'c' }, tag: 'lead' },
    { id: 'c', text: 'Anotado!', buttons: [{ title: 'Site', url: 'https://loja.com' }], replies: [], handoff: true },
    { id: 'd', text: 'Tudo bem!', buttons: [], replies: [] },
  ],
};

describe('Pulse Direct · funil', () => {
  it('valida o funil e recusa botão que leva para etapa inexistente', () => {
    const f = normalizeFlow(flowBody);
    expect(f.steps).toHaveLength(4);
    expect(f.steps[1].ask).toEqual({ field: 'telefone', next: 'c' });
    expect(() => normalizeFlow({ ...flowBody, steps: [{ id: 'a', text: 'x', replies: [{ title: 'Ir', next: 'zz' }] }] })).toThrow('não existe');
    expect(() => normalizeFlow({ ...flowBody, trigger: { type: 'dm_keyword', keywords: [] } })).toThrow('pelo menos uma palavra');
  });

  it('palavra-chave sem acento e sem diferença de maiúscula; post escolhido', () => {
    const f = normalizeFlow({ ...flowBody, trigger: { type: 'comment_keyword', keywords: ['cardápio'], post_ids: ['p1'] } });
    expect(matchesTrigger(f, 'Quero o CARDAPIO por favor', 'p1')).toBe(true);
    expect(matchesTrigger(f, 'quero o cardápio', 'p2')).toBe(false);
    expect(matchesTrigger(f, 'cardapios', 'p1')).toBe(false);
    expect(matchesTrigger(normalizeFlow({ ...flowBody, trigger: { type: 'comment_keyword', keywords: [] } }), 'qualquer', 'x')).toBe(true);
  });

  it('variáveis de nome', () => {
    expect(fillVars('Oi {primeiro_nome}!', { fields: { nome: 'Ana Souza' } })).toBe('Oi Ana!');
    expect(fillVars('Oi {primeiro_nome}!', { username: 'ana.s' })).toBe('Oi ana.s!');
  });
});

/** Banco de mentira só com o que o motor usa. */
function fakeDb(flow: Record<string, unknown>) {
  const contacts: Record<string, Record<string, unknown>> = {};
  const sent: Record<string, unknown>[] = [];
  const pool = {
    query: async (sql: string, p: unknown[] = []) => {
      if (/CREATE TABLE/.test(sql)) return { rows: [] };
      if (/FROM client_upload_post WHERE username/.test(sql)) return { rows: [{ client_id: 'c1', username: 'loja' }] };
      if (/INSERT INTO social_contacts/.test(sql)) {
        const key = String(p[2]);
        contacts[key] = contacts[key] || { id: `k-${key}`, client_id: 'c1', platform: 'instagram', ext_id: key, username: p[3], tags: [], fields: {} };
        return { rows: [contacts[key]] };
      }
      const byId = () => Object.values(contacts).find((c) => c.id === p[0]) as Record<string, unknown>;
      if (/UPDATE social_contacts SET last_in_at/.test(sql)) return { rows: [] };
      if (/UPDATE social_contacts SET flow_id/.test(sql)) { Object.assign(byId(), { flow_id: p[1], step_id: p[2], awaiting: p[3], tags: p[4] }); return { rows: [] }; }
      if (/UPDATE social_contacts SET fields/.test(sql)) { Object.assign(byId(), { fields: JSON.parse(String(p[1])), awaiting: null }); return { rows: [] }; }
      if (/FROM social_flows WHERE id/.test(sql)) return { rows: [flow] };
      if (/FROM social_flows WHERE client_id/.test(sql)) return { rows: [flow] };
      if (/SELECT company_name FROM clients/.test(sql)) return { rows: [{ company_name: 'Loja' }] };
      return { rows: [] };
    },
  };
  const uploadPost = { call: async (_m: string, path: string, o: { json: Record<string, unknown> }) => { sent.push({ path, ...o.json }); return {}; } };
  return { pool, uploadPost, contacts, sent };
}

describe('Pulse Direct · motor', () => {
  const flow = { id: 'f1', client_id: 'c1', name: 'Captura', active: true, clicks: {}, ...normalizeFlow(flowBody) };

  it('comentário com a palavra: resposta privada com o texto dos botões e resposta pública', async () => {
    const { pool, uploadPost, sent } = fakeDb(flow);
    const flows = createFlows({ pool, uploadPost });
    const name = await flows.handleComment({ platform: 'instagram', profile_username: 'loja', comment: { id: 'cm1', text: 'eu quero!', from: { id: 'u1', username: 'ana' } }, post: { id: 'p1' } });
    expect(name).toBe('Captura');
    expect(sent[0]).toMatchObject({ path: '/uploadposts/comments/reply', comment_id: 'cm1' });
    expect(String(sent[0].message)).toContain('Responda: Sim · Agora não');
    expect(sent[1]).toMatchObject({ path: '/uploadposts/comments/public-reply', message: 'Te mandei no direct!' });
  });

  it('botão de resposta → pergunta → telefone inválido pede de novo → válido guarda e avisa a equipe', async () => {
    const notes: string[] = [];
    const { pool, uploadPost, sent, contacts } = fakeDb(flow);
    const flows = createFlows({ pool, uploadPost, notifyTeam: async (t: string) => { notes.push(t); } });
    const dm = (text: string, qp?: string) => flows.handleDm({ platform: 'instagram', profile_username: 'loja', sender: { id: 'u1', username: 'ana' }, message: { text, quick_reply_payload: qp } });
    await dm('Sim', 'f:f1:b');
    expect(sent.at(-1)).toMatchObject({ path: '/uploadposts/dms/send', message: 'Manda seu WhatsApp' });
    expect(contacts.u1.awaiting).toBe('telefone');
    expect(contacts.u1.tags).toEqual(['lead']);
    await dm('não sei');
    expect(String(sent.at(-1)?.message)).toContain('DDD');
    await dm('(62) 99999-1234');
    expect((contacts.u1.fields as Record<string, string>).telefone).toBe('62999991234');
    expect(sent.at(-1)).toMatchObject({ message: 'Anotado!', buttons: [{ title: 'Site', url: 'https://loja.com' }] });
    expect(notes).toHaveLength(1);
  });

  it('resposta rápida do direct vira quick_reply com o caminho do funil', async () => {
    const dmFlow = { ...flow, trigger: { type: 'dm_keyword', keywords: ['oi'], post_ids: [] } };
    const { pool, uploadPost, sent } = fakeDb(dmFlow);
    const flows = createFlows({ pool, uploadPost });
    await flows.handleDm({ platform: 'instagram', profile_username: 'loja', sender: { id: 'u2' }, message: { text: 'Oi' } });
    expect(sent[0].quick_replies).toEqual([{ title: 'Sim', payload: 'f:f1:b' }, { title: 'Agora não', payload: 'f:f1:d' }]);
  });
});

describe('Pulse Direct · cidade', () => {
  it('quem está em Minaçu não abre a conversa de cliente de Uruaçu; cliente global abre', async () => {
    const { registerFlowRoutes } = await import('../../vps-api-server/lib/socialFlows.mjs');
    const routes: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = new Proxy({}, { get: (_t, method: string) => (path: string, fn: (req: unknown, res: unknown) => Promise<void>) => { routes[`${method} ${path}`] = fn; } });
    const clientCity: Record<string, string | null> = { cu: 'uruacu', cg: null };
    const pool = { query: async (sql: string, p: unknown[] = []) => (/FROM social_contacts WHERE id/.test(sql) ? { rows: [{ client_id: p[0] === 'k-uru' ? 'cu' : 'cg' }] } : { rows: [] }) };
    const scope = {
      city: async () => 'minacu',
      guard: async (_req: unknown, id: string) => { const c = clientCity[id]; if (c && c !== 'minacu') throw Object.assign(new Error('Este cliente é de outra cidade'), { status: 403 }); },
    };
    const flows = { messages: async () => [{ id: 1 }] };
    registerFlowRoutes(app, { flows, pool, verifySocialManager: async () => ({ user: { id: 'u' } }), scope });
    const call = async (id: string) => {
      let status = 200; let body: unknown;
      const res = { status(s: number) { status = s; return this; }, json(b: unknown) { body = b; } };
      await routes['get /api/flows/contact/:id/messages']({ params: { id }, query: {}, headers: {} }, res);
      return { status, body };
    };
    expect((await call('k-uru')).status).toBe(403);
    expect((await call('k-global')).body).toEqual({ messages: [{ id: 1 }] });
  });
});

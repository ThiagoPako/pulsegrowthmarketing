import { describe, expect, it, vi } from 'vitest';
import { approvalMessage, noAccessReply, saysNoPortalAccess, usesPortal } from '../../vps-api-server/lib/portalAccess.mjs';
import { registerPortalShareRoutes } from '../../vps-api-server/portalShareRoutes.mjs';

// Portal do cliente (usuário, 02/11/2026): sempre levar ao portal; quem não usa recebe o link sem login de cada vídeo;
// quem diz no grupo que não tem acesso recebe o cadastro na hora.
describe('portal · quem não tem acesso', () => {
  it('reconhece no grupo quem não tem ou não consegue acessar', () => {
    for (const t of ['Não tenho acesso ao portal', 'nao consigo acessar o link', 'Esqueci minha senha', 'o portal não abre aqui',
      'como eu faço login?', 'Não tenho login', 'minha senha está errada']) {
      expect(saysNoPortalAccess(t), t).toBe(true);
    }
    for (const t of ['Aprovado!', 'Ficou ótimo o vídeo', 'Amanhã tem gravação?', 'ok']) expect(saysNoPortalAccess(t), t).toBe(false);
  });

  it('usa o portal = tem login e entrou nos últimos 45 dias', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    expect(usesPortal({ users: 1, lastAccess: '2026-10-20T10:00:00Z', now })).toBe(true);
    expect(usesPortal({ users: 1, lastAccess: '2026-08-01T10:00:00Z', now })).toBe(false);
    expect(usesPortal({ users: 0, lastAccess: '2026-10-30T10:00:00Z', now })).toBe(false);
    expect(usesPortal({ users: 2, lastAccess: null, now })).toBe(false);
  });

  it('mensagem: portal para quem usa; link sem login de cada vídeo e cadastro para quem não usa', () => {
    const items = [{ title: 'Dia das Mães', link: 'https://x/aprovar/aaa' }];
    const a = approvalMessage({ firstName: 'Ana', items, portalUrl: 'https://x/portal/c1', signupUrl: 'https://x/portal-registro/c1', portalUser: true });
    expect(a).toContain('https://x/portal/c1');
    expect(a).not.toContain('aprovar/aaa');
    const b = approvalMessage({ firstName: 'Ana', items, portalUrl: 'https://x/portal/c1', signupUrl: 'https://x/portal-registro/c1', portalUser: false });
    expect(b).toContain('https://x/aprovar/aaa');
    expect(b).toContain('https://x/portal-registro/c1');
    expect(b).toMatch(/não precisa de login/);
    const r = noAccessReply({ firstName: 'Ana', signupUrl: 'https://x/portal-registro/c1', portalUrl: 'https://x/portal/c1', pending: items });
    expect(r).toContain('portal-registro/c1');
    expect(r).toContain('aprovar/aaa');
  });
});

describe('aprovação sem login · rotas', () => {
  function setup(status = 'pendente') {
    const content = { id: 'ct1', client_id: 'c1', title: 'Dia das Mães', status, file_url: 'https://x/v.mp4', content_task_id: null };
    const links: Record<string, string> = {};
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/CREATE TABLE/.test(sql)) return { rows: [] };
        if (/SELECT id, client_id FROM client_portal_contents/.test(sql)) return { rows: [content] };
        if (/INSERT INTO portal_share_links/.test(sql)) { links[params[1] as string] ||= params[0] as string; return { rows: [{ token: links[params[1] as string] }] }; }
        if (/FROM portal_share_links l/.test(sql)) return { rows: Object.values(links).includes(params[0] as string) ? [{ ...content, token: params[0], company_name: 'Clínica', logo_url: null }] : [] };
        if (/UPDATE client_portal_contents SET status = 'aprovado'/.test(sql)) {
          if (['aprovado', 'agendado', 'publicado', 'revisao_interna'].includes(content.status)) return { rows: [] };
          content.status = 'aprovado';
          return { rows: [content] };
        }
        if (/UPDATE client_portal_contents SET status = 'ajuste_solicitado'/.test(sql)) { content.status = 'ajuste_solicitado'; return { rows: [content] }; }
        return { rows: [] };
      }),
    };
    const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {};
    const app = { get: (p: string, h: never) => { handlers[`GET ${p}`] = h; }, post: (p: string, h: never) => { handlers[`POST ${p}`] = h; } };
    const approveContent = vi.fn(async () => {});
    const adjustContent = vi.fn(async () => {});
    const routes = registerPortalShareRoutes(app as never, { pool, approveContent, adjustContent, publicAppUrl: 'https://x', logger: { error: () => {} } });
    const res = () => { const r = { code: 200, body: null as unknown, status(c: number) { r.code = c; return r; }, json(b: unknown) { r.body = b; return r; }, set() { return r; } }; return r; };
    return { routes, handlers, approveContent, adjustContent, res, content };
  }

  it('o link é um só por conteúdo; aprovar mexe no Kanban uma vez', async () => {
    const t = setup();
    const url = await t.routes.shareLink('ct1');
    expect(url).toMatch(/^https:\/\/x\/aprovar\/[A-Za-z0-9_-]{20,}$/);
    expect(await t.routes.shareLink('ct1')).toBe(url);
    const token = url!.split('/').pop();
    const r = t.res();
    await t.handlers['POST /api/public/aprovar/:token']({ params: { token }, body: { action: 'approve' } }, r);
    expect(r.body).toMatchObject({ success: true, decided: 'aprovado' });
    await t.handlers['POST /api/public/aprovar/:token']({ params: { token }, body: { action: 'approve' } }, t.res());
    expect(t.approveContent).toHaveBeenCalledTimes(1);
  });

  it('pedir ajuste exige o que mudar e manda para Alteração', async () => {
    const t = setup();
    const token = (await t.routes.shareLink('ct1'))!.split('/').pop();
    const vazio = t.res();
    await t.handlers['POST /api/public/aprovar/:token']({ params: { token }, body: { action: 'adjust', notes: '' } }, vazio);
    expect(vazio.code).toBe(400);
    const ok = t.res();
    await t.handlers['POST /api/public/aprovar/:token']({ params: { token }, body: { action: 'adjust', notes: 'Trocar a música' } }, ok);
    expect(ok.body).toMatchObject({ decided: 'ajuste' });
    expect(t.adjustContent).toHaveBeenCalledWith(expect.objectContaining({ id: 'ct1' }), 'Trocar a música');
  });

  it('conteúdo em revisão interna não aparece pelo link', async () => {
    const t = setup('revisao_interna');
    const token = (await t.routes.shareLink('ct1'))!.split('/').pop();
    const r = t.res();
    await t.handlers['GET /api/public/aprovar/:token']({ params: { token } }, r);
    expect(r.code).toBe(404);
  });
});

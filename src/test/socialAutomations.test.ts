import { describe, expect, it } from 'vitest';
import { createAutomations, MODELOS, normalizeAutomation } from '../../vps-api-server/lib/socialAutomations.mjs';

describe('Automações · pedido da tela', () => {
  it('Instagram pede o link do post, limpa palavras e botões', () => {
    const a = normalizeAutomation({
      platform: 'instagram', post_url: 'https://www.instagram.com/p/abc/', trigger_keywords: ' EU QUERO, cupom ,, ', reply_message: 'Oi!',
      buttons: [{ title: 'Ver', url: 'https://loja.com' }, { title: 'sem link', url: 'loja' }],
    });
    expect(a.trigger_keywords).toEqual(['EU QUERO', 'cupom']);
    expect(a.buttons).toEqual([{ title: 'Ver', url: 'https://loja.com' }]);
    expect(() => normalizeAutomation({ platform: 'instagram', post_url: 'https://x.com/p', reply_message: 'Oi' })).toThrow('post do Instagram');
    expect(() => normalizeAutomation({ platform: 'instagram', post_url: 'https://instagram.com/p/a', reply_message: '' })).toThrow('mensagem');
    expect(() => normalizeAutomation({ platform: 'tiktok', post_id: '1', reply_message: 'Oi', buttons: [{ title: 'a', url: 'https://a' }] })).toThrow('Botões');
  });

  it('modelos prontos têm palavra, mensagem e botão', () => {
    expect(MODELOS.length).toBeGreaterThanOrEqual(4);
    for (const m of MODELOS) expect(m.palavras.length && m.mensagem && m.botao).toBeTruthy();
  });

  it('ligar chama o autodms/start com o perfil do cliente e guarda o monitor', async () => {
    const calls: { path: string; json: Record<string, unknown> }[] = [];
    let inserted: unknown[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/client_upload_post/.test(sql)) return { rows: [{ username: 'pulse-c1' }] };
        if (/INSERT INTO social_automations/.test(sql)) { inserted = params; return { rows: [{ id: 'a1' }] }; }
        return { rows: [] };
      },
    };
    const uploadPost = { call: async (_m: string, path: string, opts: { json: Record<string, unknown> }) => { calls.push({ path, json: opts?.json }); return { monitor_id: 'm-9' }; }, apiKey: async () => 'k' };
    const autos = createAutomations({ pool, uploadPost });
    await autos.create('c1', { platform: 'instagram', post_url: 'https://instagram.com/p/x', trigger_keywords: 'EU QUERO', reply_message: 'Toma o link' }, 'u1');
    expect(calls[0].path).toBe('/uploadposts/autodms/start');
    expect(calls[0].json).toMatchObject({ profile_username: 'pulse-c1', platform: 'instagram', reply_message: 'Toma o link', trigger_keywords: ['EU QUERO'] });
    expect(inserted[9]).toBe('m-9');
  });
});

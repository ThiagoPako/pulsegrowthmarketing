import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSocialHub, parseIsisDecision, verifyWebhook } from '../../vps-api-server/lib/socialHub.mjs';

describe('Central social · aviso da Upload-Post', () => {
  const secret = 'whsec_teste';
  const body = '{"event":"comment_received"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

  it('aceita a assinatura certa e recusa corpo mexido, chave errada ou aviso velho', () => {
    expect(verifyWebhook({ secret, signature: sig, timestamp: ts, rawBody: body })).toBe(true);
    expect(verifyWebhook({ secret, signature: sig, timestamp: ts, rawBody: body.replace('comment', 'dm') })).toBe(false);
    expect(verifyWebhook({ secret: 'outra', signature: sig, timestamp: ts, rawBody: body })).toBe(false);
    expect(verifyWebhook({ secret, signature: sig, timestamp: ts, rawBody: body, now: Date.now() + 10 * 60_000 })).toBe(false);
    expect(verifyWebhook({ secret: null, signature: sig, timestamp: ts, rawBody: body })).toBe(false);
  });
});

describe('Central social · decisão da Ísis', () => {
  it('lê o JSON da Ísis e recusa resposta vazia ou ação desconhecida', () => {
    expect(parseIsisDecision('{"acao":"responder","resposta":"Obrigada! 💛","motivo":"elogio"}')).toEqual({ acao: 'responder', resposta: 'Obrigada! 💛', motivo: 'elogio' });
    expect(parseIsisDecision('```json\n{"acao":"escalar","resposta":"Sentimos muito","motivo":"reclamação"}\n```')?.acao).toBe('escalar');
    expect(parseIsisDecision('{"acao":"responder","resposta":""}')).toBeNull();
    expect(parseIsisDecision('{"acao":"curtir"}')).toBeNull();
    expect(parseIsisDecision('texto solto')).toBeNull();
  });
});

describe('Central social · resposta da equipe', () => {
  it('Instagram usa a resposta pública; quem aprova o rascunho sai como Ísis', async () => {
    const calls: { path: string; json: Record<string, unknown> }[] = [];
    const updates: unknown[][] = [];
    const comment = { id: 'k1', client_id: 'c1', platform: 'instagram', comment_id: '178', post_id: 'p9', status: 'rascunho', isis_draft: 'Obrigada!' };
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/FROM social_comments WHERE id/.test(sql)) return { rows: [comment] };
        if (/client_upload_post/.test(sql)) return { rows: [{ username: 'pulse-c1' }] };
        if (/UPDATE social_comments/.test(sql)) updates.push(params);
        return { rows: [] };
      },
    };
    const uploadPost = { call: async (_m: string, path: string, { json }: { json: Record<string, unknown> }) => { calls.push({ path, json }); return { id: 'r1' }; }, apiKey: async () => 'k' };
    const hub = createSocialHub({ pool, uploadPost, resolveAiConfig: async () => null, resolveAiModel: (m: string) => m });
    await hub.replyComment('k1', 'Obrigada!', 'Thiago');
    expect(calls[0].path).toBe('/uploadposts/comments/public-reply');
    expect(calls[0].json).toMatchObject({ platform: 'instagram', user: 'pulse-c1', comment_id: '178', message: 'Obrigada!' });
    expect(updates[0]).toEqual(['k1', 'Obrigada!', 'Ísis', 'r1']);
    await hub.replyComment('k1', 'Obrigada pelo carinho!', 'Thiago');
    expect(updates[1][2]).toBe('Thiago');
  });
});

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
    expect(parseIsisDecision('{"acao":"responder","resposta":"Obrigada! 💛","motivo":"elogio"}')).toEqual({ acao: 'responder', resposta: 'Obrigada! 💛', motivo: 'elogio', remocao: '' });
    expect(parseIsisDecision('{"acao":"escalar","resposta":"Sentimos","remocao":"spam"}')?.remocao).toBe('spam');
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

describe('Monitoramento de avaliações negativas', () => {
  function setup() {
    const state = {
      monitor: { active: true, numbers: [{ name: 'Dono', phone: '5562999990000' }, { name: 'Gerente', phone: '5562988880000' }] },
      approvals: [] as Record<string, unknown>[],
      review: { id: 'r1', client_id: 'c1', review_name: 'accounts/1/locations/2/reviews/3', reviewer: 'João', rating: 1, comment: 'Péssimo', status: 'aguardando_cliente', isis_draft: 'Sentimos muito, João.', removal_reason: 'parece de concorrente', removal_status: 'sugerida', company_name: 'Loja X' } as Record<string, unknown>,
      sent: [] as { to: string; body: string }[], notes: [] as string[], calls: [] as Record<string, unknown>[],
    };
    const pool = {
      query: async (sql: string, p: unknown[] = []) => {
        if (/CREATE TABLE|ALTER TABLE|CREATE INDEX/.test(sql)) return { rows: [] };
        if (/FROM review_monitors/.test(sql)) return { rows: [state.monitor] };
        if (/INSERT INTO review_monitors/.test(sql)) { state.monitor = { active: p[1] as boolean, numbers: JSON.parse(String(p[2])) }; return { rows: [] }; }
        if (/INSERT INTO review_approvals/.test(sql)) { state.approvals.push({ id: `a${state.approvals.length}`, review_id: p[0], token: p[1], name: p[2], phone: p[3] }); return { rows: [] }; }
        if (/FROM review_approvals WHERE token/.test(sql)) return { rows: state.approvals.filter((a) => a.token === p[0]) };
        if (/UPDATE review_approvals SET action/.test(sql)) { Object.assign(state.approvals.find((a) => a.id === p[0])!, { action: p[1], note: p[2] }); return { rows: [] }; }
        if (/FROM review_approvals WHERE review_id/.test(sql)) return { rows: state.approvals };
        if (/FROM google_reviews r LEFT JOIN clients/.test(sql) || /FROM google_reviews WHERE id/.test(sql)) return { rows: [state.review] };
        if (/UPDATE google_reviews SET status = 'respondido'/.test(sql)) { Object.assign(state.review, { status: 'respondido', reply_text: p[1], reply_by: p[2] }); return { rows: [] }; }
        if (/UPDATE google_reviews SET removal_status/.test(sql)) { state.review.removal_status = p[1]; return { rows: [] }; }
        if (/client_upload_post/.test(sql)) return { rows: [{ username: 'pulse-c1' }] };
        if (/company_name FROM clients/.test(sql)) return { rows: [{ company_name: 'Loja X' }] };
        return { rows: [] };
      },
    };
    const uploadPost = { call: async (_m: string, path: string, o: { json: Record<string, unknown> }) => { state.calls.push({ path, ...o.json }); return { success: true }; }, apiKey: async () => 'k' };
    const hub = createSocialHub({
      pool, uploadPost, resolveAiConfig: async () => null, resolveAiModel: (m: string) => m,
      notifyTeam: async (t: string, m: string) => { state.notes.push(`${t} ${m}`); },
      sendWhatsApp: async (to: string, body: string) => { state.sent.push({ to, body }); },
    });
    return { hub, state };
  }

  it('cadastro: nome obrigatório, DDI 55 automático, sem número não liga', async () => {
    const { hub } = setup();
    await expect(hub.saveMonitor('c1', { active: true, numbers: [] })).rejects.toThrow('pelo menos um WhatsApp');
    await expect(hub.saveMonitor('c1', { active: true, numbers: [{ name: '', phone: '62 99999-0000' }] })).rejects.toThrow('nome');
    const m = await hub.saveMonitor('c1', { active: true, numbers: [{ name: 'Dono', phone: '(62) 99999-0000' }] });
    expect(m.numbers).toEqual([{ name: 'Dono', phone: '5562999990000' }]);
  });

  it('avaliação negativa: um link próprio por WhatsApp; aprovar publica com o nome de quem aprovou', async () => {
    const { hub, state } = setup();
    await hub.alertMonitors(state.review, { company_name: 'Loja X' });
    expect(state.sent.map((s) => s.to)).toEqual(['5562999990000', '5562988880000']);
    const [t1, t2] = state.approvals.map((a) => String(a.token));
    expect(t1).not.toBe(t2);
    expect(state.sent[0].body).toContain(`/avaliacao/${t1}`);
    const page = await hub.publicReview(t2);
    expect(page.you).toBe('Gerente');
    expect(page.removal).toEqual({ reason: 'parece de concorrente', status: 'sugerida' });
    await hub.publicDecide(t2, { action: 'approve' });
    expect(state.calls.at(-1)).toMatchObject({ path: '/uploadposts/google-business/reviews/reply', comment: 'Sentimos muito, João.' });
    expect(state.review.reply_by).toBe('Aprovado por Gerente');
    expect(state.approvals[1].action).toBe('aprovou');
    await expect(hub.publicDecide(t1, { action: 'approve' })).rejects.toThrow('já foi respondida');
  });

  it('sim para a remoção avisa a equipe; link inventado não abre', async () => {
    const { hub, state } = setup();
    await hub.alertMonitors(state.review, { company_name: 'Loja X' });
    await hub.publicDecide(String(state.approvals[0].token), { action: 'remove_yes' });
    expect(state.review.removal_status).toBe('cliente_quer');
    expect(state.notes.join(' ')).toContain('Dono autorizou denunciar');
    await expect(hub.publicReview('x'.repeat(24))).rejects.toThrow('Link não encontrado');
  });
});

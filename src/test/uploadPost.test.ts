import { describe, expect, it } from 'vitest';
import { connectedAccounts, createUploadPost, profileName, uploadFields } from '../../vps-api-server/lib/uploadPost.mjs';

const video = [{ url: 'https://agenciapulse.tech/uploads/content/a/b/v.mp4' }];
const photos = [{ url: 'https://agenciapulse.tech/uploads/x/1.png' }, { url: 'https://agenciapulse.tech/uploads/x/2.png' }];
const get = (fields: [string, string][], k: string) => fields.filter(([key]) => key === k).map(([, v]) => v);

describe('Upload-Post · campos do envio', () => {
  it('Reels no Instagram: vídeo pela URL, REELS e a legenda no title', () => {
    const { endpoint, fields } = uploadFields({ platform: 'instagram', publishType: 'reels', media: video, caption: 'Legenda' });
    expect(endpoint).toBe('/upload');
    expect(get(fields, 'media_type')).toEqual(['REELS']);
    expect(get(fields, 'video')).toEqual([video[0].url]);
    expect(get(fields, 'title')).toEqual(['Legenda']);
  });

  it('carrossel de fotos: upload_photos com um photos[] por imagem', () => {
    const { endpoint, fields } = uploadFields({ platform: 'instagram', publishType: 'carousel', media: photos, caption: '' });
    expect(endpoint).toBe('/upload_photos');
    expect(get(fields, 'photos[]')).toHaveLength(2);
    expect(get(fields, 'media_type')).toEqual(['IMAGE']);
  });

  it('Facebook leva a Página e o tipo certo (story, reels, foto)', () => {
    expect(get(uploadFields({ platform: 'facebook', publishType: 'stories', media: video, caption: 'x', facebookPageId: '123' }).fields, 'facebook_media_type')).toEqual(['STORIES']);
    const reels = uploadFields({ platform: 'facebook', publishType: 'reels', media: video, caption: 'x', facebookPageId: '123' }).fields;
    expect(get(reels, 'facebook_media_type')).toEqual(['REELS']);
    expect(get(reels, 'facebook_page_id')).toEqual(['123']);
    expect(get(uploadFields({ platform: 'facebook', publishType: 'feed', media: photos.slice(0, 1), caption: 'x' }).fields, 'facebook_media_type')).toEqual(['POSTS']);
  });

  it('YouTube ganha título curto; TikTok sai público', () => {
    expect(get(uploadFields({ platform: 'youtube', publishType: 'reels', media: video, caption: 'Linha 1\nLinha 2' }).fields, 'youtube_title')).toEqual(['Linha 1']);
    expect(get(uploadFields({ platform: 'tiktok', publishType: 'reels', media: video, caption: 'x' }).fields, 'privacy_level')).toEqual(['PUBLIC_TO_EVERYONE']);
  });
});

describe('Upload-Post · contas e perfis', () => {
  it('perfil pelo id do cliente e só as redes conectadas', () => {
    expect(profileName('ABC-1')).toBe('pulse-abc-1');
    const list = connectedAccounts({ instagram: { display_name: 'Loja', handle: '@loja', social_images: 'https://x/p.jpg' }, facebook: '', tiktok: null });
    expect(list).toEqual([{ platform: 'instagram', name: 'Loja', handle: 'loja', picture: 'https://x/p.jpg', reauth: false }]);
  });

  it('publica e devolve o post da rede; nova tentativa usa a mesma Idempotency-Key', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ success: true, results: { instagram: { url: 'https://instagram.com/p/1', post_id: '1' } } }), { status: 200 });
    };
    const pool = {
      query: async (sql: string) => (/api_key/.test(sql) ? { rows: [{ api_key: 'chave-de-teste-123456' }] } : /client_upload_post/.test(sql) ? { rows: [{ username: 'pulse-c1' }] } : { rows: [] }),
    };
    const up = createUploadPost({ pool, fetchImpl: fetchImpl as unknown as typeof fetch });
    const post = { id: 'p1', client_id: 'c1', publish_type: 'reels', caption: 'Oi', attempts: 0 };
    const r = await up.publish({ platform: 'instagram' }, post, video);
    expect(r).toEqual({ id: '1', url: 'https://instagram.com/p/1', provider: 'upload_post' });
    expect(calls[0].url).toBe('https://api.upload-post.com/api/upload');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Apikey chave-de-teste-123456');
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('pulse-p1-instagram');
    expect((calls[0].init.body as FormData).get('user')).toBe('pulse-c1');
  });

  it('erro da rede vira erro do post (e Facebook sem Página nem chega a enviar)', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ success: true, results: { instagram: { error: 'mídia recusada' } } }), { status: 200 });
    const pool = { query: async (sql: string) => (/api_key/.test(sql) ? { rows: [{ api_key: 'chave-de-teste-123456' }] } : { rows: [{ username: 'pulse-c1' }] }) };
    const up = createUploadPost({ pool, fetchImpl: fetchImpl as unknown as typeof fetch });
    const post = { id: 'p1', client_id: 'c1', publish_type: 'reels', caption: '' };
    await expect(up.publish({ platform: 'instagram' }, post, video)).rejects.toThrow('mídia recusada');
    await expect(up.publish({ platform: 'facebook', facebook_page_id: null }, post, video)).rejects.toThrow(/Página/);
  });

  it('envio que vira assíncrono: acompanha pelo request_id até concluir', async () => {
    let n = 0;
    const fetchImpl = async (url: string) => {
      n += 1;
      if (url.endsWith('/upload')) return new Response(JSON.stringify({ success: true, request_id: 'r1' }), { status: 200 });
      return new Response(JSON.stringify({ status: n < 3 ? 'processing' : 'completed', results: [{ platform: 'instagram', success: true }] }), { status: 200 });
    };
    const pool = { query: async (sql: string) => (/api_key/.test(sql) ? { rows: [{ api_key: 'chave-de-teste-123456' }] } : { rows: [{ username: 'pulse-c1' }] }) };
    const up = createUploadPost({ pool, fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const r = await up.publish({ platform: 'instagram' }, { id: 'p2', client_id: 'c1', publish_type: 'reels', caption: '' }, video);
    expect(r.provider).toBe('upload_post');
    expect(n).toBe(3);
  });
});

describe('Upload-Post · link do cliente com as redes marcadas', () => {
  it('guarda as redes do cadastro e o link pede login só nelas', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      if (init.body && typeof init.body === 'string') bodies.push(JSON.parse(init.body));
      if (url.includes('/generate-jwt')) return new Response(JSON.stringify({ success: true, access_url: 'https://app.upload-post.com/connect?token=t' }), { status: 200 });
      return new Response(JSON.stringify({ success: true, profile: {} }), { status: 200 });
    };
    let saved: string[] = [];
    const pool = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/api_key/.test(sql)) return { rows: [{ api_key: 'chave-de-teste-123456' }] };
        if (/SELECT id, company_name/.test(sql)) return { rows: [{ id: 'c1', company_name: 'Loja X' }] };
        if (/UPDATE clients SET social_networks/.test(sql)) { saved = params[1] as string[]; return { rows: [] }; }
        if (/SELECT social_networks/.test(sql)) return { rows: [{ social_networks: saved }] };
        return { rows: [] };
      },
    };
    const up = createUploadPost({ pool, fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await up.connectLink('c1', ['tiktok', 'instagram', 'orkut']);
    expect(saved).toEqual(['instagram', 'tiktok']);
    expect(r.url).toBe('https://app.upload-post.com/connect?token=t');
    const jwt = bodies.find((b) => 'platforms' in b) as { platforms: string[]; language: string };
    expect(jwt.platforms).toEqual(['instagram', 'tiktok']);
    expect(jwt.language).toBe('pt');
    await expect(up.connectLink('c1', [])).rejects.toThrow('Marque pelo menos uma rede');
  });
});

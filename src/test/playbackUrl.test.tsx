import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { __resetPlaybackCache, canHaveWebVariant, peekPlayback, resolvePlayback } from '@/lib/playbackUrl';
import { usePlaybackUrl } from '@/hooks/usePlaybackUrl';
import PlaybackVideo from '@/components/media/PlaybackVideo';

const HEAVY = 'https://agenciapulse.tech/uploads/content/c/t/1761000000000_aaaaaaaaaaaa.mp4';
const HEAVY_WEB = 'https://agenciapulse.tech/uploads/content/c/t/1761000000000_aaaaaaaaaaaa.web.mp4';
const MOV = 'https://agenciapulse.tech/uploads/content/c/t/1761000000001_bbbbbbbbbbbb.mov';

type Answer = Record<string, { variant: 'web' | 'original'; playback?: string }>;
let answers: Answer = {};
let calls: Array<{ urls: string[]; headers: Record<string, string>; avulso?: string }> = [];

function mockServer() {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ urls: body.urls, headers: init.headers as Record<string, string>, avulso: body.avulso });
    const items = body.urls.map((url: string) => {
      const a = answers[url];
      return a ? { url, playback: a.playback || url, variant: a.variant } : { url, error: 'Arquivo não encontrado' };
    });
    return new Response(JSON.stringify({ items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeEach(() => {
  __resetPlaybackCache();
  localStorage.clear();
  sessionStorage.clear();
  answers = { [HEAVY]: { variant: 'web', playback: HEAVY_WEB }, [MOV]: { variant: 'original' } };
  mockServer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('quais vídeos podem ter versão leve', () => {
  it('só vídeos da VPS em /uploads/ (nunca a própria .web.mp4, treinamento, blob ou link externo)', () => {
    expect(canHaveWebVariant(HEAVY)).toBe(true);
    expect(canHaveWebVariant(MOV)).toBe(true);
    expect(canHaveWebVariant('/uploads/content/x.mov')).toBe(true);
    expect(canHaveWebVariant(HEAVY_WEB)).toBe(false);
    expect(canHaveWebVariant('https://agenciapulse.tech/uploads/training-videos/aula.mp4')).toBe(false);
    expect(canHaveWebVariant('https://agenciapulse.tech/uploads/artes/x.png')).toBe(false);
    expect(canHaveWebVariant('https://drive.google.com/file/d/abc/view')).toBe(false);
    expect(canHaveWebVariant('https://outro.com/uploads/x.mp4')).toBe(false);
    expect(canHaveWebVariant('blob:https://agenciapulse.tech/123')).toBe(false);
    expect(canHaveWebVariant(null)).toBe(false);
  });
});

describe('resolvePlayback', () => {
  it('sem login nem token do portal toca o original sem perguntar', async () => {
    expect(await resolvePlayback(HEAVY)).toEqual({ url: HEAVY, variant: 'original' });
    expect(calls).toHaveLength(0);
  });

  it('equipe: pergunta em lote e guarda a resposta', async () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    const [a, b] = await Promise.all([resolvePlayback(HEAVY), resolvePlayback(MOV)]);
    expect(a).toEqual({ url: HEAVY_WEB, variant: 'web' });
    expect(b).toEqual({ url: MOV, variant: 'original' });
    expect(calls).toHaveLength(1);
    expect(calls[0].urls).toEqual([HEAVY, MOV]);
    expect(calls[0].headers.Authorization).toBe('Bearer jwt-equipe');
    expect(peekPlayback(HEAVY)).toEqual({ url: HEAVY_WEB, variant: 'web' });
    await resolvePlayback(HEAVY);
    expect(calls).toHaveLength(1);
  });

  it('cliente do portal manda o token do portal; link avulso manda o id do card', async () => {
    sessionStorage.setItem('portal_token', 'token-portal');
    await resolvePlayback(HEAVY);
    expect(calls[0].headers['x-portal-token']).toBe('token-portal');
    sessionStorage.clear();
    __resetPlaybackCache();
    expect(await resolvePlayback(HEAVY, { avulsoTaskId: 'card-1' })).toEqual({ url: HEAVY_WEB, variant: 'web' });
    expect(calls[1].avulso).toBe('card-1');
  });

  it('servidor fora ou lento: o original', async () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede'); }));
    expect(await resolvePlayback(HEAVY)).toEqual({ url: HEAVY, variant: 'original' });
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    expect(await resolvePlayback(MOV, { timeoutMs: 50 })).toEqual({ url: MOV, variant: 'original' });
  });

  it('links que não são da VPS não passam pelo servidor', async () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    const drive = 'https://drive.google.com/file/d/abc/view';
    expect(await resolvePlayback(drive)).toEqual({ url: drive, variant: 'original' });
    expect(calls).toHaveLength(0);
  });
});

describe('usePlaybackUrl', () => {
  it('a URL não troca no meio da reprodução, mesmo que a versão leve fique pronta depois', async () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    answers[MOV] = { variant: 'original' };
    const { result, rerender } = renderHook(({ url }) => usePlaybackUrl(url), { initialProps: { url: MOV } });
    expect(result.current.src).toBeNull();
    await waitFor(() => expect(result.current.src).toBe(MOV));
    // a conversão terminou e o cache passou a dizer "leve"
    __resetPlaybackCache();
    answers[MOV] = { variant: 'web', playback: MOV.replace('.mov', '.web.mp4') };
    await resolvePlayback(MOV);
    rerender({ url: MOV });
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(result.current.src).toBe(MOV);
    // outro vídeo: decide de novo
    rerender({ url: HEAVY });
    await waitFor(() => expect(result.current.src).toBe(HEAVY_WEB));
    expect(result.current.variant).toBe('web');
  });

  it('"Original" toca o arquivo enviado sem perguntar', () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    const { result } = renderHook(() => usePlaybackUrl(HEAVY, { original: true }));
    expect(result.current).toEqual({ src: HEAVY, variant: 'original', loading: false });
    expect(calls).toHaveLength(0);
  });
});

describe('PlaybackVideo', () => {
  it('toca a versão leve e volta para o original se ela não abrir', async () => {
    localStorage.setItem('pulse_jwt', 'jwt-equipe');
    const { container } = render(<PlaybackVideo src={HEAVY} controls />);
    const video = () => container.querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(video().getAttribute('src')).toBe(HEAVY_WEB));
    expect(video().dataset.playback).toBe('web');
    act(() => { video().dispatchEvent(new Event('error')); });
    await waitFor(() => expect(video().getAttribute('src')).toBe(HEAVY));
    expect(video().dataset.playback).toBe('original');
  });
});

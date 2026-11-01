import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCaptionPrefetch, CANDIDATES_SQL } from '../../vps-api-server/lib/captionPrefetch.mjs';

const vpsAuthedFetch = vi.fn();
vi.mock('@/lib/vpsDb', () => ({ vpsAuthedFetch: (...a: unknown[]) => vpsAuthedFetch(...a) }));

import { askVictoria } from '@/lib/victoria';

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}

const payload = { client_id: 'c1', content_format: 'reels' as const, video_type: 'vendas' as const, conversation: [{ role: 'pedido' as const, text: 'ideia' }], search: true };

describe('Victoria: roteiro chegando enquanto é escrito (streaming)', () => {
  beforeEach(() => vpsAuthedFetch.mockReset());

  it('junta os pedaços (mesmo cortados no meio do evento) e devolve o roteiro final', async () => {
    const done = { titulo: 'T', roteiro: 'R', legenda: '', referencias: [], observacoes: '', aprendizados: [], usados: { roteiros_cliente: 1, roteiros_agencia: 0, regras: 0, pesquisou: false }, ms: 4200 };
    vpsAuthedFetch.mockResolvedValue(sseResponse([
      'event: delta\ndata: {"text":"TÍTULO: T\\nROT"}\n\n',
      'event: delta\ndata: {"te',
      'xt":"EIRO:\\nR"}\n\nevent: done\ndata: ' + JSON.stringify(done) + '\n\n',
    ]));
    const seen: string[] = [];
    const result = await askVictoria(payload, (t) => seen.push(t));
    expect(seen).toEqual(['TÍTULO: T\nROT', 'TÍTULO: T\nROTEIRO:\nR']);
    expect(result).toEqual(done);
    const [, init] = vpsAuthedFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, client_id: 'c1' });
  });

  it('erro no meio do streaming vira mensagem para a tela', async () => {
    vpsAuthedFetch.mockResolvedValue(sseResponse(['event: error\ndata: {"error":"A IA não respondeu (529). Tente de novo."}\n\n']));
    await expect(askVictoria(payload)).rejects.toThrow('A IA não respondeu (529)');
  });

  it('servidor antigo (JSON) e erro HTTP continuam funcionando', async () => {
    vpsAuthedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ roteiro: 'R' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect((await askVictoria(payload)).roteiro).toBe('R');
    vpsAuthedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Escolha o cliente' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    await expect(askVictoria(payload)).rejects.toThrow('Escolha o cliente');
  });
});

describe('Legenda pronta antes de pedirem (captionPrefetch)', () => {
  function setup({ candidates = [], existing = new Set<string>(), generate }: {
    candidates?: { kind: string; id: string; client_id: string }[];
    existing?: Set<string>;
    generate?: () => Promise<{ caption: string; fonte: string }>;
  }) {
    const saved: unknown[] = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql === CANDIDATES_SQL) return { rows: candidates };
        if (sql.includes('FROM scheduling_captions')) return { rows: existing.has(`${params[0]}:${params[1]}`) ? [{}] : [] };
        return { rows: [] };
      }),
    };
    const postCaption = { generate: vi.fn(generate || (async () => ({ caption: 'Legenda pronta 🚗', fonte: 'video' }))) };
    const captionContext = vi.fn(async (kind: string, id: string) => ({ client: {}, material: { kind, id } }));
    const saveCaption = vi.fn(async (_db: unknown, row: unknown) => { saved.push(row); });
    const prefetch = createCaptionPrefetch({ pool, postCaption, captionContext, saveCaption, logger: { log: vi.fn(), warn: vi.fn() }, env: {} });
    return { prefetch, saved, postCaption, pool };
  }

  it('escreve e guarda a legenda do que vai ser postado, como gerada', async () => {
    const { prefetch, saved } = setup({ candidates: [{ kind: 'conteudo', id: 't1', client_id: 'c1' }, { kind: 'arte', id: 'a1', client_id: 'c1' }] });
    await prefetch.tick();
    expect(saved).toEqual([
      { kind: 'conteudo', id: 't1', clientId: 'c1', caption: 'Legenda pronta 🚗', userId: null, generated: true },
      { kind: 'arte', id: 'a1', clientId: 'c1', caption: 'Legenda pronta 🚗', userId: null, generated: true },
    ]);
  });

  it('não passa por cima de legenda escrita enquanto a IA trabalhava', async () => {
    const existing = new Set<string>();
    const { prefetch, saved } = setup({
      candidates: [{ kind: 'conteudo', id: 't1', client_id: 'c1' }],
      existing,
      generate: async () => { existing.add('conteudo:t1'); return { caption: 'IA', fonte: 'roteiro' }; },
    });
    await prefetch.tick();
    expect(saved).toEqual([]);
  });

  it('o que falhou só tenta de novo depois de 6 h; no máximo 4 por rodada', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) => ({ kind: 'conteudo', id: `t${i}`, client_id: 'c1' }));
    const { prefetch, postCaption } = setup({ candidates, generate: async () => { throw new Error('sem chave'); } });
    await prefetch.tick();
    expect(postCaption.generate).toHaveBeenCalledTimes(4);
    await prefetch.tick();
    // os 4 que falharam ficam para depois; a segunda rodada tenta os 2 que faltavam
    expect(postCaption.generate).toHaveBeenCalledTimes(6);
  });

  it('PULSE_CAPTION_PREFETCH=0 desliga', () => {
    const prefetch = createCaptionPrefetch({ pool: { query: vi.fn() }, postCaption: {}, captionContext: vi.fn(), saveCaption: vi.fn(), env: { PULSE_CAPTION_PREFETCH: '0' } });
    expect(prefetch.enabled).toBe(false);
  });
});

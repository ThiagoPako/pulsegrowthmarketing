import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScheduleDialog from '@/components/scheduling/ScheduleDialog';
import type { SchedulingItem } from '@/lib/postingSchedule';

const markMaterialPosted = vi.fn();
vi.mock('@/services/schedulingApi', async (orig) => {
  const real = await orig<typeof import('@/services/schedulingApi')>();
  return { ...real, markMaterialPosted: (...a: unknown[]) => markMaterialPosted(...a) };
});

const base: SchedulingItem = {
  key: 'conteudo:11111111-1111-1111-1111-111111111111',
  kind: 'conteudo',
  id: '11111111-1111-1111-1111-111111111111',
  title: 'G4 Valley · O que estamos aprendendo',
  content_type: 'reels',
  type: 'reels',
  column: 'acompanhamento',
  approved_at: null,
  thumb_url: null,
  media_url: null,
  media_kind: 'video',
  media_items: [],
  caption: '',
  platform_label: null,
  state: 'manual',
  when: { date: '2026-11-02', time: '18:00', at: '2026-11-02T21:00:00.000Z' },
  mode: 'manual',
  locked: false,
  post: null,
};

function abrir(item: SchedulingItem, onSaved = vi.fn()) {
  render(<ScheduleDialog item={item} clientId="c1" accounts={[]} onClose={vi.fn()} onSaved={onSaved} />);
  return onSaved;
}

describe('Agendamentos: marcar como postado (postagem manual)', () => {
  beforeEach(() => markMaterialPosted.mockReset());

  it('item manual agendado mostra o botão e carimba como postado', async () => {
    markMaterialPosted.mockResolvedValue({ already: false });
    const onSaved = abrir(base);
    fireEvent.click(screen.getAllByRole('button', { name: /marcar como postado/i })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /sim, foi postado/i }));
    await waitFor(() => expect(markMaterialPosted).toHaveBeenCalledWith({ client_id: 'c1', kind: 'conteudo', id: base.id }));
    expect(onSaved).toHaveBeenCalledWith('✅ Marcado como postado');
  });

  it('já publicado ou com post automático não mostra o botão', () => {
    abrir({ ...base, state: 'publicado', locked: true });
    expect(screen.queryAllByRole('button', { name: /marcar como postado/i })).toHaveLength(0);
  });

  it('item ainda sem data não mostra o botão', () => {
    abrir({ ...base, state: 'nao_agendado', when: null });
    expect(screen.queryAllByRole('button', { name: /marcar como postado/i })).toHaveLength(0);
  });
});

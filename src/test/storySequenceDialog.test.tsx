import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScheduleDialog from '@/components/scheduling/ScheduleDialog';
import type { SchedulingItem } from '@/lib/postingSchedule';

const scheduleMaterial = vi.fn();
vi.mock('@/services/schedulingApi', async (orig) => {
  const real = await orig<typeof import('@/services/schedulingApi')>();
  return { ...real, scheduleMaterial: (...a: unknown[]) => scheduleMaterial(...a) };
});

const telas = ['https://agenciapulse.tech/uploads/t1.png', 'https://agenciapulse.tech/uploads/t2.png', 'https://agenciapulse.tech/uploads/t3.png'];
const arte: SchedulingItem = {
  key: 'arte:22222222-2222-2222-2222-222222222222',
  kind: 'arte',
  id: '22222222-2222-2222-2222-222222222222',
  title: 'Alerta de golpe',
  content_type: 'story_sequencia',
  type: 'story',
  column: 'aprovado',
  approved_at: null,
  thumb_url: null,
  media_url: telas[0],
  media_kind: 'image',
  media_items: telas,
  caption: '',
  platform_label: null,
  state: 'nao_agendado',
  when: null,
  mode: null,
  locked: false,
  post: null,
} as unknown as SchedulingItem;

const contas = [{ id: 'a1', platform: 'instagram' as const, account_name: 'NiqTurbo', username: 'niqturbotelecom' }];

function abrir(item: SchedulingItem = arte) {
  render(<ScheduleDialog item={item} clientId="c1" accounts={contas} presetDate="2099-11-04" presetTime="10:00" onClose={vi.fn()} onSaved={vi.fn()} />);
}

describe('Estúdio de Postagem: sequência de story', () => {
  beforeEach(() => scheduleMaterial.mockReset().mockResolvedValue({ when: null, mode: 'auto' }));

  it('a arte de sequência já abre como story em sequência e manda as telas na ordem', async () => {
    abrir();
    const caixa = screen.getByRole('checkbox', { name: /sequência de story/i });
    expect(caixa).toBeChecked();
    expect(screen.getByText(/ordem dos stories/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^agendar$/i })[0]);
    await waitFor(() => expect(scheduleMaterial).toHaveBeenCalled());
    const enviado = scheduleMaterial.mock.calls[0][0];
    expect(enviado).toMatchObject({ publish_type: 'stories', mode: 'auto', story_mode: 'auto', story_sequence: true, media_items: telas });
  });

  it('desmarcada, sai só a primeira tela como story comum', async () => {
    abrir();
    fireEvent.click(screen.getByRole('checkbox', { name: /sequência de story/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^agendar$/i })[0]);
    await waitFor(() => expect(scheduleMaterial).toHaveBeenCalled());
    const enviado = scheduleMaterial.mock.calls[0][0];
    expect(enviado.story_sequence).toBeUndefined();
    expect(enviado.media_url).toBe(telas[0]);
  });

  it('story de uma tela só não oferece a sequência', () => {
    abrir({ ...arte, content_type: 'story', media_items: [telas[0]] } as SchedulingItem);
    expect(screen.queryByRole('checkbox', { name: /sequência de story/i })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { describeDesignFormat, dimensionsFromPreset, formatTypeForDimensions } from '@/lib/designBrief';
import { suggestFormat, type SchedulingItem } from '@/lib/postingSchedule';
import { describeDesignFormat as serverDescribe } from '../../vps-api-server/lib/designBrief.mjs';
import { buildMaterials, storySequenceSlots, STORY_SEQUENCE_MAX } from '../../vps-api-server/scheduling.mjs';

// Sequência de story (usuário, 03/11/2026): a arte com várias telas de story aparece no Estúdio de Postagem
// para sair como stories seguidos, na ordem.
describe('sequência de story', () => {
  it('formato da arte: 1080×1920, de 2 a 10 stories, igual no site e no servidor', () => {
    const dims = dimensionsFromPreset('story_sequencia', { slides: 4 });
    const info = describeDesignFormat(dims)!;
    expect(info.label).toBe('Sequência de story · 1080×1920 px · 4 stories');
    expect(info.short).toBe('Sequência de story 1080×1920 · 4 stories');
    expect(info.pixels).toEqual({ width: 1080, height: 1920 });
    expect(formatTypeForDimensions(dims)).toBe('story_sequencia');
    expect(serverDescribe(dims, 'story_sequencia')?.label).toBe(info.label);
    expect(describeDesignFormat(dimensionsFromPreset('story_sequencia', { slides: 40 }))?.slides).toBe(10);
    // card criado só com o format_type (agente, Victoria): o formato vem dele
    expect(serverDescribe(null, 'story_sequencia')?.slides).toBe(3);
  });

  it('horário de cada story: o 1º no horário escolhido, os outros 1 minuto depois do anterior', () => {
    expect(storySequenceSlots('2026-11-04T13:00:00.000Z', 3)).toEqual([
      '2026-11-04T13:00:00.000Z', '2026-11-04T13:01:00.000Z', '2026-11-04T13:02:00.000Z',
    ]);
    expect(storySequenceSlots('data ruim', 3)).toEqual([]);
    expect(STORY_SEQUENCE_MAX).toBe(10);
  });

  it('no Estúdio, a arte de sequência aparece como story e com todas as telas', () => {
    const urls = ['https://agenciapulse.tech/uploads/a1.png', 'https://agenciapulse.tech/uploads/a2.png', 'https://agenciapulse.tech/uploads/a3.png'];
    const { unscheduled } = buildMaterials({
      contents: [], deliveries: [], portals: [], posts: [], series: [], captions: [],
      designs: [{ id: 'd1', title: 'Golpe', format_type: 'story_sequencia', kanban_column: 'aprovado', attachment_urls: urls }],
    }, { from: '2026-11-01', to: '2026-11-30', publicAppUrl: 'https://agenciapulse.tech' });
    const art = unscheduled.find((i: { key: string }) => i.key === 'arte:d1') as unknown as SchedulingItem;
    expect(art.type).toBe('story');
    expect(art.content_type).toBe('story_sequencia');
    expect(art.media_items).toEqual(urls);
    expect(suggestFormat(art)).toBe('stories');
  });

  it('com a sequência agendada, o calendário mostra o 1º story (desempate pelo índice)', () => {
    const at = (min: number) => `2026-11-04T13:0${min}:00.000Z`;
    const created = '2026-11-03T18:00:00.000Z';
    const post = (i: number) => ({
      id: `p${i}`, client_id: 'c1', design_task_id: 'd1', status: 'agendado', platform: 'instagram', publish_type: 'stories',
      media_url: `https://agenciapulse.tech/uploads/a${i + 1}.png`, caption: '', scheduled_at: at(i), created_at: created,
      story_mode: 'auto', story_sequence_id: 's1', story_sequence_index: i,
    });
    const { scheduled } = buildMaterials({
      contents: [], deliveries: [], portals: [], series: [], captions: [],
      posts: [post(2), post(0), post(1)],
      designs: [{ id: 'd1', title: 'Golpe', format_type: 'story_sequencia', kanban_column: 'aprovado', posting_at: at(0),
        attachment_urls: ['https://agenciapulse.tech/uploads/a1.png', 'https://agenciapulse.tech/uploads/a2.png', 'https://agenciapulse.tech/uploads/a3.png'] }],
    }, { from: '2026-11-01', to: '2026-11-30', publicAppUrl: 'https://agenciapulse.tech' });
    const art = scheduled.find((i: { key: string }) => i.key === 'arte:d1') as unknown as SchedulingItem;
    expect(art.post?.id).toBe('p0');
    expect(art.post?.story_sequence_index).toBe(0);
    expect(art.when?.time).toBe('10:00');
  });
});

import { describe, expect, it } from 'vitest';
import { buildMaterials } from '../../vps-api-server/scheduling.mjs';

describe('criativos no agendamento', () => {
  it('criativo aprovado entra em "não agendados", marcado como criativo e sugerido como story', () => {
    const { unscheduled } = buildMaterials({
      creatives: [{ id: 'c1', title: 'Oferta 10x', content_type: 'criativo', approved_at: '2026-11-01T12:00:00Z', edited_video_link: '/uploads/oferta.mp4', script_id: null }],
    }, { from: '2026-11-01', to: '2026-11-30', publicAppUrl: 'https://agenciapulse.tech' });
    expect(unscheduled).toHaveLength(1);
    expect(unscheduled[0]).toMatchObject({ kind: 'conteudo', id: 'c1', creative: true, type: 'story', content_type: 'criativo', state: 'nao_agendado' });
    expect(unscheduled[0].media_url).toContain('oferta.mp4');
  });

  it('criativo sem vídeo não aparece', () => {
    const { unscheduled } = buildMaterials({
      creatives: [{ id: 'c2', title: 'Sem vídeo', content_type: 'criativo', approved_at: '2026-11-01T12:00:00Z', edited_video_link: '' }],
    }, { from: '2026-11-01', to: '2026-11-30', publicAppUrl: 'https://agenciapulse.tech' });
    expect(unscheduled).toHaveLength(0);
  });
});

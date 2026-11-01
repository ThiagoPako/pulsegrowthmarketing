import { describe, expect, it } from 'vitest';
import { normalizeCampaignInput, victoriaRequest, slotFormat, strategyText } from '../../vps-api-server/lib/campaignIsis.mjs';

const base = {
  name: 'Black Friday do Posto',
  type: 'promocional',
  objective: 'Encher a pista na sexta',
  start_date: '2026-11-20',
  end_date: '2026-11-28',
  strategy: { publico: 'Motoristas de Minaçu', mensagem: 'Abastecer na Black é no Naraely', oferta: 'Lavagem grátis acima de 40 litros', cta: 'Chame no WhatsApp' },
  slots: [
    { kind: 'creative', title: 'Arte da oferta', post_date: '2026-11-21', idea: 'Feed + story com a lavagem' },
    { kind: 'video', title: 'Reels da lavagem', post_date: '2026-11-20', idea: 'Antes e depois do carro', format: 'reels' },
    { kind: 'video', title: 'Story contagem', post_date: '2026-11-27', format: 'story' },
  ],
};

describe('campanha da Ísis', () => {
  it('vira rascunho com o editorial primeiro e as peças por data', () => {
    const { campaign, slots } = normalizeCampaignInput(base);
    expect(campaign).toMatchObject({ status: 'rascunho', videos_qty: 2, creatives_qty: 1, type: 'promocional' });
    expect(campaign.editorial.isis.strategy.oferta).toBe('Lavagem grátis acima de 40 litros');
    expect(slots.map((s) => s.kind)).toEqual(['editorial', 'video', 'creative', 'video']);
    expect(slots[0].notes).toContain('Público: Motoristas de Minaçu');
    expect(slots[1].notes).toBe('Antes e depois do carro\nFormato: reels');
    expect(slotFormat(slots[3].notes)).toBe('story');
  });

  it('recusa peça fora do período, tipo errado e estratégia sem público', () => {
    expect(() => normalizeCampaignInput({ ...base, slots: [{ kind: 'video', title: 'x', post_date: '2026-12-01' }] })).toThrow(/fora da campanha/);
    expect(() => normalizeCampaignInput({ ...base, type: 'qualquer' })).toThrow(/Tipo inválido/);
    expect(() => normalizeCampaignInput({ ...base, strategy: { mensagem: 'x' } })).toThrow(/público/);
  });

  it('o pedido à Victoria leva a estratégia e a ideia, sem inventar oferta', () => {
    const { campaign, slots } = normalizeCampaignInput(base);
    const req = victoriaRequest({ ...campaign }, slots[1]);
    expect(req).toMatchObject({ format: 'reels', videoType: 'vendas' });
    expect(req.text).toContain('Peça: Reels da lavagem · postagem em 20/11/2026');
    expect(req.text).toContain('Ideia da peça: Antes e depois do carro');
    expect(req.text).not.toContain('Formato:');
    expect(req.text).toContain(strategyText(campaign.editorial.isis.strategy));
    expect(req.text).toContain('nada inventado');
  });
});

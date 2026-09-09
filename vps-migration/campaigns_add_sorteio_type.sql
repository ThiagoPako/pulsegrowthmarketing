-- ═══════════════════════════════════════════════════════════════
-- Adiciona o tipo 'sorteio' ao CHECK constraint de campaigns
-- Campanha de Sorteio de Brindes (engajamento + captura de contatos)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_type_check
  CHECK (type IN ('institucional','promocional','sazonal','lancamento','responsabilidade_social','evento','agro','sorteio'));

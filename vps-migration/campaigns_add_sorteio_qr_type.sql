-- ═══════════════════════════════════════════════════════════════
-- Adiciona o tipo 'sorteio_qr' ao CHECK constraint de campaigns
-- Campanha operada pelo módulo Sorteios de Prêmios (QR Code / roleta / raspadinha)
-- Idempotente
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_type_check;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_type_check
  CHECK (type IN ('institucional','promocional','sazonal','lancamento','responsabilidade_social','evento','agro','sorteio','sorteio_qr'));

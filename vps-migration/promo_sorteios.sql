-- ============================================================
-- MÓDULO SORTEIOS DE PRÊMIOS (roleta / raspadinha com QR Code)
-- Idempotente — rodar em cada banco de cidade
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  rules_text TEXT DEFAULT '',
  require_lead_capture BOOLEAN NOT NULL DEFAULT false,
  require_document BOOLEAN NOT NULL DEFAULT false,
  lgpd_terms_text TEXT DEFAULT '',
  banner_url TEXT,
  logo_url TEXT,
  accent_color TEXT NOT NULL DEFAULT '#E11D48',
  code_prefix TEXT NOT NULL DEFAULT 'A3P',
  validation_pin TEXT NOT NULL DEFAULT '1234',
  is_active BOOLEAN NOT NULL DEFAULT true,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  remaining_quantity INTEGER NOT NULL DEFAULT 0,
  win_probability_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_prizes_campaign ON promo_prizes(campaign_id);

CREATE TABLE IF NOT EXISTS promo_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  batch_label TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','opened','revealed','redeemed','expired')),
  game_type TEXT,
  prize_id UUID REFERENCES promo_prizes(id) ON DELETE SET NULL,
  redemption_code TEXT UNIQUE,
  participant_name TEXT,
  participant_phone TEXT,
  participant_document TEXT,
  lgpd_accepted BOOLEAN NOT NULL DEFAULT false,
  opened_at TIMESTAMPTZ,
  revealed_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promo_tickets_token ON promo_tickets(token);
CREATE INDEX IF NOT EXISTS idx_promo_tickets_campaign ON promo_tickets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promo_tickets_code ON promo_tickets(redemption_code);
CREATE INDEX IF NOT EXISTS idx_promo_tickets_batch ON promo_tickets(campaign_id, batch_label);

-- ============================================================
-- MÓDULO CAMPANHAS — Schema para VPS PostgreSQL
-- Rodar em cada banco de cidade (pulse_minacu, pulse_uruacu)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('institucional','promocional','sazonal','lancamento','responsabilidade_social','evento','agro')),
  objective TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  videos_qty INTEGER NOT NULL DEFAULT 0,
  creatives_qty INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('rascunho','ativa','concluida','arquivada')),
  owner_id UUID,
  editorial JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_client ON public.campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);

CREATE TABLE IF NOT EXISTS public.campaign_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('editorial','video','creative')),
  title TEXT,
  post_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','roteiro_pronto','gravado','editado','postado')),
  script_id UUID,
  content_task_id UUID,
  design_task_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_slots_campaign_pos ON public.campaign_slots(campaign_id, position);
CREATE INDEX IF NOT EXISTS idx_campaign_slots_post_date ON public.campaign_slots(post_date);

-- Colunas de vínculo nas tabelas existentes (nullable, não quebra fluxo atual)
ALTER TABLE public.scripts       ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;
ALTER TABLE public.content_tasks ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;
ALTER TABLE public.design_tasks  ADD COLUMN IF NOT EXISTS campaign_slot_id UUID;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_campaigns_updated ON public.campaigns;
CREATE TRIGGER trg_campaigns_updated BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_campaign_slots_updated ON public.campaign_slots;
CREATE TRIGGER trg_campaign_slots_updated BEFORE UPDATE ON public.campaign_slots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

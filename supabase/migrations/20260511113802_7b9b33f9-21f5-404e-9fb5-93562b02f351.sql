-- Create enum if not exists
DO $$ BEGIN
    CREATE TYPE public.cost_allocation_rule AS ENUM ('approved', 'recorded', 'posted');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add cost_allocation_rule to company_settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS cost_allocation_rule public.cost_allocation_rule DEFAULT 'approved';

-- Comment for documentation
COMMENT ON COLUMN public.company_settings.cost_allocation_rule IS 'Regra de rateio para cálculo de custo por unidade: aprovadas, gravadas ou postadas.';
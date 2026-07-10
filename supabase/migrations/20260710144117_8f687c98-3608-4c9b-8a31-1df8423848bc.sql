ALTER TABLE public.financial_contracts
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS contract_duration_months integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS renewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_count integer DEFAULT 0;
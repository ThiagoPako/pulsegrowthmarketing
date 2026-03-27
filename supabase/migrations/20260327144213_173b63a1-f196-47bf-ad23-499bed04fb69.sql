ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS editing_deadline_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_deadline_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alteration_deadline_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_deadline_enabled boolean NOT NULL DEFAULT true;
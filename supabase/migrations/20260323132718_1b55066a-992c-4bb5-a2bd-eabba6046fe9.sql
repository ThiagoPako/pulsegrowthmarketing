
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS has_recording boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_photography boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'completo';


-- Add accepts_extra_content boolean to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS accepts_extra_content boolean NOT NULL DEFAULT false;

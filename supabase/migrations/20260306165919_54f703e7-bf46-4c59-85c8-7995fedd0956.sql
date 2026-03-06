ALTER TABLE public.company_settings 
  ADD COLUMN editing_deadline_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN review_deadline_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN alteration_deadline_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN approval_deadline_hours integer NOT NULL DEFAULT 6;
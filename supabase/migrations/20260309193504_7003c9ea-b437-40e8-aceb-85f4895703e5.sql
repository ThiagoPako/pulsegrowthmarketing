ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text DEFAULT '';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
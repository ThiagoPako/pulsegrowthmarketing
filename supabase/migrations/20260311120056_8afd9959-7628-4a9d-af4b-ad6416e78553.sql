
-- Add client_type and editorial to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'novo';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS editorial text DEFAULT '';

-- Create onboarding_tasks table
CREATE TABLE IF NOT EXISTS public.onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'contrato',
  title text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'pendente',
  contract_url text,
  contract_sent boolean DEFAULT false,
  contract_signed boolean DEFAULT false,
  briefing_completed boolean DEFAULT false,
  briefing_data jsonb DEFAULT '{}'::jsonb,
  wants_new_identity boolean,
  use_real_photos boolean,
  photo_warning_shown boolean DEFAULT false,
  assigned_to uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage onboarding" ON public.onboarding_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Social media manage onboarding" ON public.onboarding_tasks FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "Authenticated view onboarding" ON public.onboarding_tasks FOR SELECT TO authenticated
  USING (true);

-- Add checklist column to design_tasks
ALTER TABLE public.design_tasks ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;

-- Allow public access for briefing page (no auth)
CREATE POLICY "Public can update onboarding briefing" ON public.onboarding_tasks FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public can view onboarding tasks" ON public.onboarding_tasks FOR SELECT TO anon
  USING (true);

-- Allow public to view client for briefing
CREATE POLICY "Public can view client for onboarding" ON public.clients FOR SELECT TO anon
  USING (true);

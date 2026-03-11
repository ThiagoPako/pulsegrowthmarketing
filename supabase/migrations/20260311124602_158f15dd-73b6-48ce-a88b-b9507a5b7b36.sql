
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS photo_preference text NOT NULL DEFAULT 'nao_precisa',
ADD COLUMN IF NOT EXISTS has_photo_shoot boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS accepts_photo_shoot_cost boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS briefing_data jsonb DEFAULT '{}'::jsonb;

-- Allow anon to update clients for onboarding (photo + briefing)
CREATE POLICY "Anon can update client onboarding fields"
ON public.clients
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

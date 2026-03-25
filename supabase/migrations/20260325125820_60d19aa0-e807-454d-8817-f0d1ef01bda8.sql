
ALTER TABLE public.scripts ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS recording_id UUID REFERENCES public.recordings(id) ON DELETE SET NULL;

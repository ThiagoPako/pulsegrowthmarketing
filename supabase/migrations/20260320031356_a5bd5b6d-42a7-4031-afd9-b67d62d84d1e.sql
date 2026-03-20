ALTER TABLE public.recordings 
ADD COLUMN IF NOT EXISTS wait_started_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS wait_ended_at timestamptz DEFAULT NULL;
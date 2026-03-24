ALTER TABLE public.content_tasks 
ADD COLUMN IF NOT EXISTS editing_paused_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS editing_paused_seconds integer NOT NULL DEFAULT 0;
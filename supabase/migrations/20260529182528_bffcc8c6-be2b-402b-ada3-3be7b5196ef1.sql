-- Add prospect_name column to content_tasks
ALTER TABLE public.content_tasks ADD COLUMN IF NOT EXISTS prospect_name TEXT;

-- client_id is already nullable, but ensuring it just in case
ALTER TABLE public.content_tasks ALTER COLUMN client_id DROP NOT NULL;

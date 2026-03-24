ALTER TABLE public.content_tasks 
ADD COLUMN IF NOT EXISTS reviewing_by uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reviewing_by_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reviewing_at timestamp with time zone DEFAULT NULL;
ALTER TABLE public.content_tasks 
ADD COLUMN drive_link text DEFAULT NULL,
ADD COLUMN editing_deadline timestamptz DEFAULT NULL,
ADD COLUMN editing_started_at timestamptz DEFAULT NULL;
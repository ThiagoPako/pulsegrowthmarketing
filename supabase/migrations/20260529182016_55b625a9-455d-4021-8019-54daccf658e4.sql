-- Add prospect_name column to design_tasks
ALTER TABLE public.design_tasks ADD COLUMN IF NOT EXISTS prospect_name TEXT;

-- Make client_id nullable
ALTER TABLE public.design_tasks ALTER COLUMN client_id DROP NOT NULL;


ALTER TABLE public.recordings ADD COLUMN prospect_name text;
ALTER TABLE public.recordings ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.revenues ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.revenues ALTER COLUMN contract_id DROP NOT NULL;
ALTER TABLE public.revenues ADD COLUMN IF NOT EXISTS description text;
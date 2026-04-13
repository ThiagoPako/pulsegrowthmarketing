
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
ADD COLUMN IF NOT EXISTS cancellation_date date,
ADD COLUMN IF NOT EXISTS cancellation_reason text;

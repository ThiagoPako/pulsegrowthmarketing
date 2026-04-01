
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES public.commercial_proposals(id) ON DELETE SET NULL DEFAULT NULL;

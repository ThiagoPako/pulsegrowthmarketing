
ALTER TABLE public.commercial_proposals
  ADD COLUMN IF NOT EXISTS proposal_type text NOT NULL DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS system_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS endomarketing_data jsonb DEFAULT '{}'::jsonb;

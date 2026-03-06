
ALTER TABLE public.content_tasks 
ADD COLUMN IF NOT EXISTS script_alteration_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS script_alteration_notes text DEFAULT NULL;

COMMENT ON COLUMN public.content_tasks.script_alteration_type IS 'Type of script alteration: altered (script was changed), verbal (alteration communicated verbally), null (no alteration)';
COMMENT ON COLUMN public.content_tasks.script_alteration_notes IS 'Notes from videomaker about what changed in the script';

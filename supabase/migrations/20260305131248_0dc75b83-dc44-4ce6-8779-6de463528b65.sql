
ALTER TABLE public.social_media_deliveries 
ADD COLUMN scheduled_time text DEFAULT NULL,
ADD COLUMN script_id uuid REFERENCES public.scripts(id) ON DELETE SET NULL DEFAULT NULL,
ADD COLUMN recording_id uuid REFERENCES public.recordings(id) ON DELETE SET NULL DEFAULT NULL;

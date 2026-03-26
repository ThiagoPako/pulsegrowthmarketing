
-- Event recordings table for event coverage scheduling
CREATE TABLE public.event_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  videomaker_id uuid REFERENCES public.profiles(id),
  title text NOT NULL DEFAULT '',
  date date NOT NULL,
  start_time text NOT NULL DEFAULT '08:00',
  end_time text NOT NULL DEFAULT '18:00',
  address text NOT NULL DEFAULT '',
  description text,
  status text NOT NULL DEFAULT 'agendado',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage event recordings" ON public.event_recordings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Social media manage event recordings" ON public.event_recordings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "Videomaker manage own event recordings" ON public.event_recordings FOR ALL TO authenticated
  USING (videomaker_id = auth.uid())
  WITH CHECK (videomaker_id = auth.uid());

CREATE POLICY "Authenticated view event recordings" ON public.event_recordings FOR SELECT TO authenticated
  USING (true);

-- Add event_recording_id column to scripts table for linking
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS event_recording_id uuid REFERENCES public.event_recordings(id);

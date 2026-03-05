
-- Content production Kanban tasks
CREATE TABLE public.content_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT 'reels',
  kanban_column text NOT NULL DEFAULT 'ideias',
  description text,
  recording_id uuid REFERENCES public.recordings(id) ON DELETE SET NULL,
  script_id uuid REFERENCES public.scripts(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_recording_date date,
  scheduled_recording_time text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_tasks ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin manage content tasks"
  ON public.content_tasks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Social media full access
CREATE POLICY "Social media manage content tasks"
  ON public.content_tasks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

-- Editor full access
CREATE POLICY "Editor manage content tasks"
  ON public.content_tasks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'editor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'editor'::app_role));

-- All authenticated can view
CREATE POLICY "Authenticated can view content tasks"
  ON public.content_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_tasks;

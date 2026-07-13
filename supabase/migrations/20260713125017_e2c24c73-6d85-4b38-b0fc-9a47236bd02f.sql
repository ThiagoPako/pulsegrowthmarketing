
CREATE TABLE public.story_editing_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  videomaker_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  stories_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_story_sessions_videomaker ON public.story_editing_sessions(videomaker_id);
CREATE INDEX idx_story_sessions_active ON public.story_editing_sessions(videomaker_id) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_editing_sessions TO authenticated;
GRANT ALL ON public.story_editing_sessions TO service_role;

ALTER TABLE public.story_editing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view story sessions"
  ON public.story_editing_sessions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Videomakers manage own sessions"
  ON public.story_editing_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = videomaker_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = videomaker_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_story_sessions_updated_at
  BEFORE UPDATE ON public.story_editing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

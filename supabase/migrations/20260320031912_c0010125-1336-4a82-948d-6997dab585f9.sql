
CREATE TABLE public.recording_wait_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL,
  videomaker_id UUID NOT NULL,
  client_id UUID NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  wait_duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recording_wait_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view wait logs" ON public.recording_wait_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Videomaker manage own wait logs" ON public.recording_wait_logs
  FOR ALL TO authenticated
  USING (videomaker_id = auth.uid())
  WITH CHECK (videomaker_id = auth.uid());

CREATE POLICY "Admin manage wait logs" ON public.recording_wait_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

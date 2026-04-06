
CREATE TABLE public.fieldwork_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  videomaker_id UUID NOT NULL,
  client_id UUID NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'taker',
  notes TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fieldwork_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fieldwork" ON public.fieldwork_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Videomaker manage own fieldwork" ON public.fieldwork_activities FOR ALL TO authenticated USING (videomaker_id = auth.uid()) WITH CHECK (videomaker_id = auth.uid());
CREATE POLICY "Admin manage fieldwork" ON public.fieldwork_activities FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

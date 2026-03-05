
CREATE TABLE public.financial_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id UUID,
  description TEXT NOT NULL DEFAULT '',
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage financial log" ON public.financial_activity_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view financial log" ON public.financial_activity_log
  FOR SELECT TO authenticated
  USING (true);

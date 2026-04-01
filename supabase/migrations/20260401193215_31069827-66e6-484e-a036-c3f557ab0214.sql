
CREATE TABLE public.proposal_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage proposal checklist" ON public.proposal_checklist_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Social media manage proposal checklist" ON public.proposal_checklist_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'social_media'::app_role));

CREATE POLICY "Authenticated view proposal checklist" ON public.proposal_checklist_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Anon view proposal checklist by client" ON public.proposal_checklist_items
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon update proposal checklist" ON public.proposal_checklist_items
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

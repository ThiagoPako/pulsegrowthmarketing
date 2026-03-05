
CREATE TABLE public.social_media_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content_type text NOT NULL DEFAULT 'reels',
  title text NOT NULL DEFAULT '',
  description text,
  delivered_at date NOT NULL DEFAULT CURRENT_DATE,
  posted_at date,
  platform text,
  status text NOT NULL DEFAULT 'entregue',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.social_media_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view social deliveries" ON public.social_media_deliveries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage social deliveries" ON public.social_media_deliveries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Social media manage social deliveries" ON public.social_media_deliveries FOR ALL TO authenticated USING (has_role(auth.uid(), 'social_media'::app_role)) WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

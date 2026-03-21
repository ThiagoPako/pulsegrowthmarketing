
CREATE TABLE public.client_testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL DEFAULT '',
  client_role TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_testimonials ENABLE ROW LEVEL SECURITY;

-- Public can insert (via token link) and read approved
CREATE POLICY "anon_insert_testimonials" ON public.client_testimonials
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_read_approved_testimonials" ON public.client_testimonials
  FOR SELECT TO anon, authenticated USING (status = 'approved');

-- Admin full access
CREATE POLICY "admin_manage_testimonials" ON public.client_testimonials
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Social media can manage
CREATE POLICY "social_media_manage_testimonials" ON public.client_testimonials
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'social_media'::app_role))
  WITH CHECK (has_role(auth.uid(), 'social_media'::app_role));

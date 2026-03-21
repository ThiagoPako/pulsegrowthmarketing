CREATE TABLE public.landing_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL UNIQUE,
  video_url text,
  title text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_page_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_landing_settings" ON public.landing_page_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "anon_read_landing_settings" ON public.landing_page_settings
  FOR SELECT TO anon, authenticated
  USING (true);

INSERT INTO public.landing_page_settings (section, title, description)
VALUES ('quem_somos', 'Conheça a Pulse', 'Veja quem está por trás da sua estratégia de crescimento');

CREATE TABLE public.regulations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  client_name text NOT NULL,
  content text,
  external_url text,
  city text NOT NULL DEFAULT 'minacu',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_regulations_slug ON public.regulations(slug);
CREATE INDEX idx_regulations_city ON public.regulations(city);

CREATE TABLE public.regulation_clicks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regulation_id uuid NOT NULL REFERENCES public.regulations(id) ON DELETE CASCADE,
  user_agent text,
  referrer text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_regulation_clicks_reg ON public.regulation_clicks(regulation_id);
CREATE INDEX idx_regulation_clicks_at ON public.regulation_clicks(clicked_at DESC);

GRANT SELECT ON public.regulations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.regulations TO authenticated;
GRANT ALL ON public.regulations TO service_role;

GRANT SELECT, INSERT ON public.regulation_clicks TO anon, authenticated;
GRANT DELETE ON public.regulation_clicks TO authenticated;
GRANT ALL ON public.regulation_clicks TO service_role;

ALTER TABLE public.regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulation_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view regulations" ON public.regulations FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert regulations" ON public.regulations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update regulations" ON public.regulations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete regulations" ON public.regulations FOR DELETE TO authenticated USING (true);

CREATE POLICY "Anyone can insert regulation clicks" ON public.regulation_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can view regulation clicks" ON public.regulation_clicks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can delete regulation clicks" ON public.regulation_clicks FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_regulations_updated_at BEFORE UPDATE ON public.regulations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

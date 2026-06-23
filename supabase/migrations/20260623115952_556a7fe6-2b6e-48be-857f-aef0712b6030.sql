
CREATE TABLE public.short_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  original_url TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'minacu',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_short_links_slug ON public.short_links(slug);
CREATE INDEX idx_short_links_city ON public.short_links(city);

CREATE TABLE public.short_link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  short_link_id UUID NOT NULL REFERENCES public.short_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  referrer TEXT,
  ip TEXT
);
CREATE INDEX idx_short_link_clicks_link ON public.short_link_clicks(short_link_id);
CREATE INDEX idx_short_link_clicks_date ON public.short_link_clicks(clicked_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.short_links TO authenticated;
GRANT SELECT ON public.short_links TO anon;
GRANT ALL ON public.short_links TO service_role;

GRANT SELECT, INSERT ON public.short_link_clicks TO authenticated;
GRANT SELECT, INSERT ON public.short_link_clicks TO anon;
GRANT ALL ON public.short_link_clicks TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_link_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active short links by slug"
  ON public.short_links FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert short links"
  ON public.short_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated can update short links"
  ON public.short_links FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete short links"
  ON public.short_links FOR DELETE TO authenticated
  USING (true);

CREATE POLICY "Anyone can view clicks"
  ON public.short_link_clicks FOR SELECT
  USING (true);

CREATE POLICY "Anyone can register clicks"
  ON public.short_link_clicks FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER update_short_links_updated_at
  BEFORE UPDATE ON public.short_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

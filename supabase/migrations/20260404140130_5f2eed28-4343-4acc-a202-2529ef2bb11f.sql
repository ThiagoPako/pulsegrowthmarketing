CREATE TABLE IF NOT EXISTS public.tv_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tv_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tv_settings" ON public.tv_settings FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage tv_settings" ON public.tv_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.tv_settings (key, value) VALUES ('youtube_playlist_url', '');
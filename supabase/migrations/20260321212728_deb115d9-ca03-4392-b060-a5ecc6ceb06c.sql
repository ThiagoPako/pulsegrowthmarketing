
-- Table for plan explanation videos
CREATE TABLE IF NOT EXISTS public.plan_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL UNIQUE,
  video_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_plan_videos" ON public.plan_videos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admin_manage_plan_videos" ON public.plan_videos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed plan video rows
INSERT INTO public.plan_videos (plan_name) VALUES
  ('Starter'), ('Boost'), ('Premium'), ('Elite'), ('Endomarketing')
ON CONFLICT (plan_name) DO NOTHING;
